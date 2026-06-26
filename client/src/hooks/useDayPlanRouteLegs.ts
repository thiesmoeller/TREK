import { useEffect, useRef, useState } from 'react'
import type { Accommodation, Day, MergedItem, RouteSegment } from '../types'

export type DayPlanHotelLegs = {
  top?: { seg: RouteSegment; name: string }
  bottom?: { seg: RouteSegment; name: string }
}

interface UseDayPlanRouteLegsInput {
  selectedDayId: number | null
  routeShown: boolean
  routeProfile: 'driving' | 'walking'
  routeSegments: RouteSegment[]
  mergedItemsMap: Record<number, MergedItem[]>
  accommodations: Accommodation[]
  days: Day[]
  optimizeFromAccommodation: boolean | undefined
}

/** Sidebar connector legs come from the server-owned mixed route endpoint. */
export function useDayPlanRouteLegs({
  selectedDayId,
  routeShown,
  routeSegments,
  mergedItemsMap,
}: UseDayPlanRouteLegsInput) {
  const [routeLegs, setRouteLegs] = useState<Record<number, RouteSegment>>({})
  const [hotelLegs, setHotelLegs] = useState<DayPlanHotelLegs>({})
  const legsAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (legsAbortRef.current) legsAbortRef.current.abort()
    if (!selectedDayId || !routeShown) { setRouteLegs({}); setHotelLegs({}); return }
    const merged = mergedItemsMap[selectedDayId] || []

    if (routeSegments.length === 0) {
      setRouteLegs({})
      setHotelLegs({})
      return
    }

    const startAssignmentIds: number[] = []
    let cur: number[] = []
    for (const it of merged) {
      if (it.type === 'place' && (it.data as { place?: { lat?: number; lng?: number } }).place?.lat && (it.data as { place?: { lat?: number; lng?: number } }).place?.lng) {
        cur.push((it.data as { id: number }).id)
      } else if (it.type === 'transport') {
        for (let i = 0; i < cur.length - 1; i++) startAssignmentIds.push(cur[i])
        cur = []
      }
    }
    for (let i = 0; i < cur.length - 1; i++) startAssignmentIds.push(cur[i])

    const map: Record<number, RouteSegment> = {}
    startAssignmentIds.forEach((id, i) => {
      const leg = routeSegments[i]
      if (leg) map[id] = leg
    })
    setRouteLegs(map)
    setHotelLegs({})
  }, [selectedDayId, routeShown, routeSegments, mergedItemsMap])

  return { routeLegs, hotelLegs }
}
