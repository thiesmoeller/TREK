import { effectiveRouteMode } from '@trek/shared'
import type { Assignment } from '../types'

export { effectiveRouteMode, normalizeRouteMode, parseRouteModeOverride } from '@trek/shared'
export type { RouteLegMode } from '@trek/shared'

/** True when any leg before the day's last stop uses waterway routing (blocks TSP optimize). */
export function dayHasWaterwayLegsBeforeLast(
  assignments: Assignment[],
  tripDefaultRouteMode: unknown,
): boolean {
  return assignments.slice(0, -1).some(a =>
    effectiveRouteMode(a.route_mode_override, tripDefaultRouteMode) === 'waterway',
  )
}
