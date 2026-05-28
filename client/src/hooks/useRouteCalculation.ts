import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { useTripStore } from '../store/tripStore'
import { calculateSegments } from '../components/Map/RouteCalculator'
import { tripsApi } from '../api/client'
import { useTranslation } from '../i18n'
import { formatRouteLegPill } from '../utils/formatRouteLeg'
import type { TripStoreState } from '../store/tripStore'
import type { RouteSegment, RouteResult } from '../types'

const TRANSPORT_TYPES = ['flight', 'train', 'bus', 'car', 'cruise']

/**
 * Builds per-day route polylines (split at transport reservations) and optional leg labels.
 * When route calculation is on, uses the server mixed waterway/OSRM geometry API; otherwise
 * keeps straight-line segments with no pills.
 */
export function useRouteCalculation(tripStore: TripStoreState, selectedDayId: number | null, routeShown = true) {
  const { t } = useTranslation()
  const [route, setRoute] = useState<[number, number][][] | null>(null)
  const [routeInfo, setRouteInfo] = useState<RouteResult | null>(null)
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([])
  const routeCalcEnabled = useSettingsStore((s) => s.settings.route_calculation) !== false
  const rowingSpeedKmh = useTripStore((s) => Number((s.trip as { rowing_speed_kmh?: number } | null)?.rowing_speed_kmh) || 6)
  const routeAbortRef = useRef<AbortController | null>(null)
  const reservationsForSignature = useTripStore((s) => s.reservations)
  const tripId = useTripStore((s) => s.trip?.id ?? null)
  const tripRouteDefaultSig = useTripStore((s) => `${s.trip?.id ?? ''}_${(s.trip as { default_route_leg_kind?: string } | null)?.default_route_leg_kind ?? 'walking'}`)

  const buildStraightSegmentsForDay = useCallback((dayId: number): [number, number][][] => {
    const currentAssignments = useTripStore.getState().assignments || {}
    const da = (currentAssignments[String(dayId)] || []).slice().sort((a, b) => a.order_index - b.order_index)
    const allReservations = useTripStore.getState().reservations || []
    const allDays = useTripStore.getState().days || []
    const dayOrder = (id: number | null | undefined): number | null => {
      if (id == null) return null
      const d = allDays.find(x => x.id === id)
      return d ? ((d as { day_number?: number }).day_number ?? allDays.indexOf(d)) : null
    }
    const thisOrder = dayOrder(dayId)

    const dayTransports = thisOrder == null ? [] : allReservations.filter(r => {
      if (!TRANSPORT_TYPES.includes(r.type)) return false
      const startId = r.day_id
      if (startId == null) return false
      const endId = r.end_day_id ?? startId
      if (startId === endId) {
        if (startId !== dayId) return false
      } else {
        const startOrder = dayOrder(startId)
        const endOrder = dayOrder(endId)
        if (startOrder == null || endOrder == null) return false
        if (thisOrder < startOrder || thisOrder > endOrder) return false
      }
      const pos = r.day_positions?.[dayId] ?? r.day_positions?.[String(dayId)] ?? r.day_plan_position
      return pos != null
    })

    type Entry = { kind: 'place'; lat: number; lng: number } | { kind: 'transport' }
    const entries: (Entry & { pos: number })[] = [
      ...da.filter(a => a.place?.lat && a.place?.lng).map(a => ({
        kind: 'place' as const, lat: a.place.lat!, lng: a.place.lng!, pos: a.order_index,
      })),
      ...dayTransports.map(r => ({
        kind: 'transport' as const,
        pos: (r.day_positions?.[dayId] ?? r.day_positions?.[String(dayId)] ?? r.day_plan_position) as number,
      })),
    ].sort((a, b) => a.pos - b.pos)

    const segmentsStraight: [number, number][][] = []
    let currentSeg: [number, number][] = []
    for (const entry of entries) {
      if (entry.kind === 'place') {
        currentSeg.push([entry.lat, entry.lng])
      } else {
        if (currentSeg.length >= 2) segmentsStraight.push([...currentSeg])
        currentSeg = []
      }
    }
    if (currentSeg.length >= 2) segmentsStraight.push(currentSeg)
    return segmentsStraight
  }, [])

  const mapRouteLegs = useCallback((legs: {
    polylineIndex: number
    rowingText?: string | null
    paddleText?: string | null
    walkingText: string
    drivingText: string
    mid: [number, number]
    from: [number, number]
    to: [number, number]
    distanceM?: number
    durationS?: number
    lockDelayS?: number
    lockCount?: number
    isFallback?: boolean
    kind?: string
    waterwayContext?: RouteSegment['waterwayContext']
  }[], polylineOffset = 0): RouteSegment[] => (legs || []).map(l => {
    const legKind = l.kind === 'waterway' || l.kind === 'walking' || l.kind === 'driving' ? l.kind : undefined
    const labels = formatRouteLegPill(t, {
      kind: legKind,
      distanceM: l.distanceM,
      durationS: l.durationS,
      lockDelayS: l.lockDelayS,
      isFallback: l.isFallback,
      rowingSpeedKmh,
    })
    return {
      polylineIndex: (l.polylineIndex ?? 0) + polylineOffset,
      rowingText: labels.rowingText ?? l.rowingText ?? l.paddleText ?? undefined,
      legKind,
      mid: l.mid,
      from: l.from,
      to: l.to,
      walkingText: labels.walkingText || l.walkingText,
      drivingText: labels.drivingText || l.drivingText,
      distanceM: l.distanceM,
      durationS: l.durationS,
      lockDelayS: l.lockDelayS,
      lockCount: l.lockCount,
      isFallback: l.isFallback,
      waterwayContext: l.waterwayContext,
    }
  }), [t, rowingSpeedKmh])

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
        const allSegments: [number, number][][] = []
        const allLegs: RouteSegment[] = []
        for (const id of dayIds) {
          if (controller.signal.aborted) return
          const straightForDay = buildStraightSegmentsForDay(id)
          if (straightForDay.length === 0) continue
          try {
            const geo = await tripsApi.postDayRouteGeometry(currentTripId, id, { signal: controller.signal }) as {
              segments: [number, number][][]
              legs: Parameters<typeof mapRouteLegs>[0]
            }
            if (controller.signal.aborted) return
            const offset = allSegments.length
            if (geo?.segments?.length) {
              allSegments.push(...geo.segments)
              allLegs.push(...mapRouteLegs(geo.legs || [], offset))
            } else {
              allSegments.push(...straightForDay)
            }
          } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') return
            if (controller.signal.aborted) return
            allSegments.push(...straightForDay)
          }
        }
        if (controller.signal.aborted) return
        setRoute(allSegments.length > 0 ? allSegments : null)
        setRouteSegments(allLegs)
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return
        if (!controller.signal.aborted) setRouteSegments([])
      }
      return
    }
    const currentAssignments = useTripStore.getState().assignments || {}
    const da = (currentAssignments[String(dayId)] || []).slice().sort((a, b) => a.order_index - b.order_index)
    const allReservations = useTripStore.getState().reservations || []
    const allDays = useTripStore.getState().days || []
    const dayOrder = (id: number | null | undefined): number | null => {
      if (id == null) return null
      const d = allDays.find(x => x.id === id)
      return d ? ((d as { day_number?: number }).day_number ?? allDays.indexOf(d)) : null
    }
    const thisOrder = dayOrder(dayId)

    const dayTransports = thisOrder == null ? [] : allReservations.filter(r => {
      if (!TRANSPORT_TYPES.includes(r.type)) return false
      const startId = r.day_id
      if (startId == null) return false
      const endId = r.end_day_id ?? startId
      if (startId === endId) {
        if (startId !== dayId) return false
      } else {
        const startOrder = dayOrder(startId)
        const endOrder = dayOrder(endId)
        if (startOrder == null || endOrder == null) return false
        if (thisOrder < startOrder || thisOrder > endOrder) return false
      }
      const pos = r.day_positions?.[dayId] ?? r.day_positions?.[String(dayId)] ?? r.day_plan_position
      return pos != null
    })

    type Entry = { kind: 'place'; lat: number; lng: number } | { kind: 'transport' }
    const entries: (Entry & { pos: number })[] = [
      ...da.filter(a => a.place?.lat && a.place?.lng).map(a => ({
        kind: 'place' as const, lat: a.place.lat!, lng: a.place.lng!, pos: a.order_index,
      })),
      ...dayTransports.map(r => ({
        kind: 'transport' as const,
        pos: (r.day_positions?.[dayId] ?? r.day_positions?.[String(dayId)] ?? r.day_plan_position) as number,
      })),
    ].sort((a, b) => a.pos - b.pos)

    const segmentsStraight: [number, number][][] = []
    let currentSeg: [number, number][] = []
    for (const entry of entries) {
      if (entry.kind === 'place') {
        currentSeg.push([entry.lat, entry.lng])
      } else {
        if (currentSeg.length >= 2) segmentsStraight.push([...currentSeg])
        currentSeg = []
      }
    }
    if (currentSeg.length >= 2) segmentsStraight.push(currentSeg)

    const geocodedWaypoints = da.map(a => a.place).filter(p => p?.lat && p?.lng) as { lat: number; lng: number }[]

    if (segmentsStraight.length === 0 && geocodedWaypoints.length < 2) {
      setRoute(null); setRouteSegments([]); return
    }

    setRoute(segmentsStraight.length > 0 ? segmentsStraight : null)

    if (!routeCalcEnabled) { setRouteSegments([]); return }

    const currentTripId = useTripStore.getState().trip?.id
    if (!currentTripId) { setRouteSegments([]); return }

    const controller = new AbortController()
    routeAbortRef.current = controller
    try {
      const geo = await tripsApi.postDayRouteGeometry(currentTripId, dayId, { signal: controller.signal }) as {
        segments: [number, number][][]
        legs: {
          polylineIndex: number
          rowingText?: string | null
          /** @deprecated server previously used paddleText */
          paddleText?: string | null
          walkingText: string
          drivingText: string
          mid: [number, number]
          from: [number, number]
          to: [number, number]
          distanceM?: number
          kind?: string
          waterwayContext?: RouteSegment['waterwayContext']
        }[]
      }

      if (controller.signal.aborted) return

      if (geo?.segments?.length) {
        setRoute(geo.segments)
      } else if (segmentsStraight.length > 0) {
        setRoute(segmentsStraight)
      }

      setRouteSegments(mapRouteLegs(geo?.legs || []))
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      if (controller.signal.aborted) return
      /** Offline / server routing failure: preserve straight overlays and OSRM pill fallback */
      if (segmentsStraight.length > 0) setRoute(segmentsStraight)
      try {
        const calcSegments = await calculateSegments(geocodedWaypoints, { signal: controller.signal })
        if (!controller.signal.aborted) {
          const withIdx = calcSegments.map((s, i) => ({ ...s, polylineIndex: 0, legKind: 'walking' as const }))
          setRouteSegments(withIdx)
        }
      } catch {
        if (!controller.signal.aborted) setRouteSegments([])
      }
    }
  }, [buildStraightSegmentsForDay, mapRouteLegs, routeCalcEnabled, routeShown])

  const transportSignature = useMemo(() => {
    if (!selectedDayId) {
      return reservationsForSignature
        .filter(r => TRANSPORT_TYPES.includes(r.type))
        .map(r => `${r.id}:${r.day_id ?? ''}:${r.end_day_id ?? ''}:${r.reservation_time ?? ''}:${r.day_plan_position ?? ''}:${JSON.stringify(r.day_positions ?? {})}`)
        .sort()
        .join('|')
    }
    return reservationsForSignature
      .filter(r => TRANSPORT_TYPES.includes(r.type))
      .map(r => {
        const pos = r.day_positions?.[selectedDayId] ?? r.day_positions?.[String(selectedDayId)] ?? r.day_plan_position
        return `${r.id}:${r.day_id ?? ''}:${r.end_day_id ?? ''}:${r.reservation_time ?? ''}:${pos ?? ''}`
      })
      .sort()
      .join('|')
  }, [reservationsForSignature, selectedDayId])

  const assignmentRouteSig = useMemo(() => {
    const list = (selectedDayId
      ? (tripStore.assignments?.[String(selectedDayId)] || []).slice()
      : Object.entries(tripStore.assignments || {})
        .flatMap(([dayId, items]) => (items || []).map(a => ({ ...a, _dayId: dayId }))))
      .sort((a, b) => a.order_index - b.order_index)
    return list.map(a => `${(a as { _dayId?: string })._dayId ?? selectedDayId}:${a.id}:${a.order_index}:${a.route_leg_override ?? ''}:${a.place?.lat ?? ''}:${a.place?.lng ?? ''}`).join('|')
  }, [tripStore.assignments, selectedDayId])

  const selectedDayAssignments = selectedDayId ? tripStore.assignments?.[String(selectedDayId)] : null
  useEffect(() => {
    updateRouteForDay(selectedDayId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDayId, selectedDayAssignments, transportSignature, assignmentRouteSig, tripRouteDefaultSig, tripId, routeShown])

  return { route, routeSegments, routeInfo, setRoute, setRouteInfo, updateRouteForDay }
}
