import { Car, Footprints, Route as RouteIcon, type LucideIcon } from 'lucide-react'
import type { RouteSegment } from '../../types'

export function routeLegIcon(seg: RouteSegment, profile: 'driving' | 'walking'): LucideIcon {
  const driving = profile === 'driving' && seg.routeMode !== 'waterway'
  if (seg.routeMode === 'waterway') return RouteIcon
  return driving ? Car : Footprints
}

export function routeLegConnectorLabel(seg: RouteSegment, profile: 'driving' | 'walking'): string {
  const waterText = seg.waterwayText ?? null
  const driving = profile === 'driving' && seg.routeMode !== 'waterway'
  return waterText
    || seg.durationText
    || (driving ? seg.drivingText : seg.walkingText)
}
