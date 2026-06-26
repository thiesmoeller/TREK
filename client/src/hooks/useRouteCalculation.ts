import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { buildDayRouteItinerary, getTransportForDay, type DayRouteLeg } from '@trek/shared'
import { useSettingsStore } from '../store/settingsStore'
import { useTripStore } from '../store/tripStore'
import { getDayBookendHotels } from '../utils/dayOrder'
import { tripsApi } from '../api/client'
import { useTranslation } from '../i18n'
import { formatRouteLegPill } from '../utils/formatRouteLeg'
import type { TripStoreState } from '../store/tripStore'
import type { RouteSegment, RouteResult, Accommodation } from '../types'

const ALL_DAYS_ROUTE_CONCURRENCY = 4
const NO_ACCOMMODATIONS: Accommodation[] = []

type Waypoint = { lat: number; lng: number }
type RouteBookends = {
  start?: [number, number][]
  end?: [number, number][]
}

export function addAccommodationBookendsToStraightSegments(
  segments: [number, number][][],
  bookends: RouteBookends,
): [number, number][][] {
  return [
    ...(bookends.start ? [bookends.start] : []),
    ...segments,
    ...(bookends.end ? [bookends.end] : []),
  ]
}

export function addAccommodationBookendsToServerRoute(
  segments: [number, number][][],
  legs: DayRouteLeg[],
  bookends: RouteBookends,
): { segments: [number, number][][]; legs: DayRouteLeg[] } {
  const leading = bookends.start ? 1 : 0
  return {
    segments: addAccommodationBookendsToStraightSegments(segments, bookends),
    legs: legs.map(leg => ({
      ...leg,
      polylineIndex: leg.polylineIndex + leading,
    })),
  }
}

async function fetchAllDayRoutesParallel(
  tripId: number,
  dayIds: number[],
  options: {
    signal: AbortSignal
    buildRouteInputForDay: (dayId: number) => {
      straightSegments: [number, number][][]
      bookends: RouteBookends
    }
    mapRouteLegs: (legs: DayRouteLeg[], polylineOffset?: number) => RouteSegment[]
  },
): Promise<{ allSegments: [number, number][][]; allLegs: RouteSegment[] } | { aborted: true }> {
  const { signal, buildRouteInputForDay, mapRouteLegs } = options
  const entries = dayIds
    .map(id => ({ id, routeInput: buildRouteInputForDay(id) }))
    .map(e => ({ id: e.id, straightForDay: e.routeInput.straightSegments, bookends: e.routeInput.bookends }))
    .filter(e => e.straightForDay.length > 0)

  const byId = new Map<number, { segments: [number, number][][]; legs: DayRouteLeg[] }>()
  let cursor = 0

  async function worker() {
    while (cursor < entries.length) {
      if (signal.aborted) return
      const idx = cursor++
      const { id, straightForDay, bookends } = entries[idx]
      try {
        const geo = await tripsApi.getDayRoute(tripId, id, { signal }) as {
          segments: [number, number][][]
          legs: DayRouteLeg[]
        }
        if (signal.aborted) return
        byId.set(id, geo?.segments?.length
          ? addAccommodationBookendsToServerRoute(geo.segments, geo.legs || [], bookends)
          : { segments: straightForDay, legs: [] })
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return
        if (signal.aborted) return
        byId.set(id, { segments: straightForDay, legs: [] })
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(ALL_DAYS_ROUTE_CONCURRENCY, entries.length) }, () => worker()),
  )
  if (signal.aborted) return { aborted: true }

  const allSegments: [number, number][][] = []
  const allLegs: RouteSegment[] = []
  for (const id of dayIds) {
    const { straightSegments } = buildRouteInputForDay(id)
    if (straightSegments.length === 0) continue
    const fetched = byId.get(id)
    if (!fetched) continue
    const offset = allSegments.length
    allSegments.push(...fetched.segments)
    allLegs.push(...mapRouteLegs(fetched.legs, offset))
  }
  return { allSegments, allLegs }
}

/**
 * Builds per-day route polylines (split at transport reservations) and optional leg labels.
 * When route calculation is on, uses the server mixed waterway/OSRM geometry API; otherwise
 * keeps straight-line segments with no pills.
 */
export function useRouteCalculation(
  tripStore: TripStoreState,
  selectedDayId: number | null,
  routeShown = true,
  _routeProfile: 'driving' | 'walking' | 'cycling' = 'driving',
  accommodations: Accommodation[] = NO_ACCOMMODATIONS,
) {
  const { t } = useTranslation()
  const [route, setRoute] = useState<[number, number][][] | null>(null)
  const [routeInfo, setRouteInfo] = useState<RouteResult | null>(null)
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([])
  const routeCalcEnabled = useSettingsStore((s) => s.settings.route_calculation) !== false
  const optimizeFromAccommodation = useSettingsStore((s) => s.settings.optimize_from_accommodation)
  const waterwaySpeedKmh = useTripStore((s) => Number((s.trip as { waterway_speed_kmh?: number } | null)?.waterway_speed_kmh) || 6)
  const routeAbortRef = useRef<AbortController | null>(null)
  const reservationsForSignature = useTripStore((s) => s.reservations)
  // Recompute when the user flips km↔mi so leg distances (formatted at compute time)
  // refresh instead of showing stale cached text (#1300).
  const distanceUnit = useSettingsStore((s) => s.settings.distance_unit)
  const tripId = useTripStore((s) => s.trip?.id ?? null)
  const tripRouteDefaultSig = useTripStore((s) => `${s.trip?.id ?? ''}_${(s.trip as { default_route_mode?: string } | null)?.default_route_mode ?? 'walking'}`)

  const buildRouteInputForDay = useCallback((dayId: number): {
    straightSegments: [number, number][][]
    geocodedWaypoints: Waypoint[]
    bookends: RouteBookends
  } => {
    const currentAssignments = useTripStore.getState().assignments || {}
    const da = (currentAssignments[String(dayId)] || []).slice().sort((a, b) => a.order_index - b.order_index)
    const allReservations = useTripStore.getState().reservations || []
    const allDays = useTripStore.getState().days || []
    const defaultRouteMode = (useTripStore.getState().trip as { default_route_mode?: string } | null)?.default_route_mode
    const { straightSegments } = buildDayRouteItinerary({
      dayId,
      days: allDays,
      assignments: da,
      reservations: allReservations,
      defaultRouteMode,
    })

    const day = allDays.find(d => d.id === dayId)
    const bookendHotels = day && optimizeFromAccommodation !== false
      ? getDayBookendHotels(day, allDays, accommodations)
      : {}
    const { morning: startHotel, evening: endHotel } = bookendHotels
    const hotelPt = (a?: Accommodation): [number, number] | null =>
      a && a.place_lat != null && a.place_lng != null ? [a.place_lat, a.place_lng] : null
    const geocodedWaypoints = da
      .map(a => a.place)
      .filter(p => p?.lat != null && p?.lng != null)
      .map(p => ({ lat: p.lat as number, lng: p.lng as number }))
    const flatPoints = straightSegments.flat()
    const samePoint = (pt: [number, number] | undefined, waypoint: Waypoint | undefined): boolean =>
      !!pt && !!waypoint && pt[0] === waypoint.lat && pt[1] === waypoint.lng
    const first = flatPoints[0] ?? (geocodedWaypoints[0]
      ? [geocodedWaypoints[0].lat, geocodedWaypoints[0].lng] as [number, number]
      : undefined)
    const last = flatPoints[flatPoints.length - 1] ?? (geocodedWaypoints[geocodedWaypoints.length - 1]
      ? [
        geocodedWaypoints[geocodedWaypoints.length - 1].lat,
        geocodedWaypoints[geocodedWaypoints.length - 1].lng,
      ] as [number, number]
      : undefined)
    const startPt = hotelPt(startHotel)
    const endPt = hotelPt(endHotel)
    const firstIsPlace = samePoint(first, geocodedWaypoints[0])
    const lastIsPlace = samePoint(last, geocodedWaypoints[geocodedWaypoints.length - 1])
    const drawMorning = firstIsPlace || !!bookendHotels.morningIsSleptHere
    const drawEvening = lastIsPlace || !!bookendHotels.eveningIsOvernight
    const bookends: RouteBookends = {
      start: startPt && first && drawMorning ? [startPt, first] : undefined,
      end: endPt && last && drawEvening ? [last, endPt] : undefined,
    }
    if (!bookends.start && !bookends.end && startPt && endPt && drawMorning && drawEvening) {
      if (startPt[0] !== endPt[0] || startPt[1] !== endPt[1]) bookends.start = [startPt, endPt]
    }

    return {
      straightSegments: addAccommodationBookendsToStraightSegments(straightSegments, bookends),
      geocodedWaypoints,
      bookends,
    }
  }, [accommodations, optimizeFromAccommodation])

  const buildStraightSegmentsForDay = useCallback(
    (dayId: number): [number, number][][] => buildRouteInputForDay(dayId).straightSegments,
    [buildRouteInputForDay],
  )

  const mapRouteLegs = useCallback((legs: DayRouteLeg[], polylineOffset = 0): RouteSegment[] => (legs || []).map(l => {
    const routeMode = l.routeMode
    const labels = formatRouteLegPill(t, {
      kind: routeMode,
      distanceM: l.distanceM,
      durationS: l.durationS,
      isApproximate: l.isApproximate,
      waterwaySpeedKmh,
    })
    return {
      polylineIndex: l.polylineIndex + polylineOffset,
      waterwayText: labels.waterwayText ?? undefined,
      routeMode,
      mid: l.mid,
      from: l.from,
      to: l.to,
      walkingText: labels.walkingText,
      drivingText: labels.drivingText,
      distanceM: l.distanceM,
      durationS: l.durationS,
      isApproximate: l.isApproximate,
    }
  }), [t, waterwaySpeedKmh])

  const updateRouteForDay = useCallback(async (dayId: number | null) => {
    if (routeAbortRef.current) routeAbortRef.current.abort()
    if (!routeShown) {
      setRoute(null)
      setRouteSegments([])
      setRouteInfo(null)
      return
    }
    if (!dayId) {
      const allDays = useTripStore.getState().days || []
      const dayIds = allDays.map(d => d.id).filter((id): id is number => typeof id === 'number')
      const straightByDay = dayIds.flatMap(id => buildStraightSegmentsForDay(id))
      setRoute(straightByDay.length > 0 ? straightByDay : null)
      if (!routeCalcEnabled) { setRouteSegments([]); return }

      const currentTripId = useTripStore.getState().trip?.id
      if (!currentTripId || dayIds.length === 0) { setRouteSegments([]); return }

      const controller = new AbortController()
      routeAbortRef.current = controller
      try {
        const result = await fetchAllDayRoutesParallel(currentTripId, dayIds, {
          signal: controller.signal,
          buildRouteInputForDay,
          mapRouteLegs,
        })
        if ('aborted' in result) return
        const { allSegments, allLegs } = result
        if (controller.signal.aborted) return
        setRoute(allSegments.length > 0 ? allSegments : null)
        setRouteSegments(allLegs)
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return
        if (!controller.signal.aborted) setRouteSegments([])
      }
      return
    }

    const { straightSegments, geocodedWaypoints, bookends } = buildRouteInputForDay(dayId)

    if (straightSegments.length === 0 && geocodedWaypoints.length < 2) {
      setRoute(null)
      setRouteSegments([])
      return
    }

    setRoute(straightSegments.length > 0 ? straightSegments : null)

    if (!routeCalcEnabled) { setRouteSegments([]); return }

    const currentTripId = useTripStore.getState().trip?.id
    if (!currentTripId) { setRouteSegments([]); return }

    const controller = new AbortController()
    routeAbortRef.current = controller
    try {
      const geo = await tripsApi.getDayRoute(currentTripId, dayId, { signal: controller.signal }) as {
        segments: [number, number][][]
        legs: DayRouteLeg[]
      }

      if (controller.signal.aborted) return

      if (geo?.segments?.length) {
        const displayed = addAccommodationBookendsToServerRoute(geo.segments, geo.legs || [], bookends)
        setRoute(displayed.segments)
        setRouteSegments(mapRouteLegs(displayed.legs))
      } else if (straightSegments.length > 0) {
        setRoute(straightSegments)
        setRouteSegments([])
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      if (controller.signal.aborted) return
      if (straightSegments.length > 0) setRoute(straightSegments)
      setRouteSegments([])
    }
  }, [buildRouteInputForDay, buildStraightSegmentsForDay, mapRouteLegs, routeCalcEnabled, routeShown])

  const transportSignature = useMemo(() => {
    const days = tripStore.days || []
    const assignments = tripStore.assignments || {}
    const serialize = (dayId: number) => {
      const dayAssignmentIds = (assignments[String(dayId)] || []).map(a => a.id)
      return getTransportForDay({
        reservations: reservationsForSignature,
        dayId,
        dayAssignmentIds,
        days,
      })
        .map(r => `${r.id}:${r.day_id ?? ''}:${r.end_day_id ?? ''}:${r.reservation_time ?? ''}:${JSON.stringify(r.day_positions ?? {})}:${JSON.stringify(r.endpoints ?? [])}`)
        .sort()
        .join('|')
    }
    if (!selectedDayId) {
      return days.map(d => serialize(d.id)).join('||')
    }
    return serialize(selectedDayId)
  }, [reservationsForSignature, selectedDayId, tripStore.assignments, tripStore.days])

  const assignmentRouteSig = useMemo(() => {
    const list = (selectedDayId
      ? (tripStore.assignments?.[String(selectedDayId)] || []).slice()
      : Object.entries(tripStore.assignments || {})
        .flatMap(([dayId, items]) => (items || []).map(a => ({ ...a, _dayId: dayId }))))
      .sort((a, b) => a.order_index - b.order_index)
    return list.map(a => `${(a as { _dayId?: string })._dayId ?? selectedDayId}:${a.id}:${a.order_index}:${a.route_mode_override ?? ''}:${a.place?.lat ?? ''}:${a.place?.lng ?? ''}`).join('|')
  }, [tripStore.assignments, selectedDayId])

  const selectedDayAssignments = selectedDayId ? tripStore.assignments?.[String(selectedDayId)] : null
  useEffect(() => {
    updateRouteForDay(selectedDayId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDayId, selectedDayAssignments, transportSignature, assignmentRouteSig, tripRouteDefaultSig, tripId, routeShown, accommodations, optimizeFromAccommodation, distanceUnit])

  return { route, routeSegments, routeInfo, setRoute, setRouteInfo, updateRouteForDay }
}
