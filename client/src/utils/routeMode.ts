import { effectiveRouteMode, type RouteModeDescriptor } from '@trek/shared'
import type { Assignment } from '../types'

export { effectiveRouteMode, normalizeRouteMode, parseRouteModeOverride } from '@trek/shared'
export type { RouteLegMode } from '@trek/shared'

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string

/** Built-in modes use labelKey for i18n; plugin modes use manifest label. */
export function routeModeLabel(descriptor: RouteModeDescriptor, t: TranslateFn): string {
  return descriptor.labelKey ? t(descriptor.labelKey) : descriptor.label
}

/** True when any leg before the day's last stop uses a mode with allowsOptimize false. */
export function dayHasNonOptimizableLegsBeforeLast(
  assignments: Assignment[],
  tripDefaultRouteMode: unknown,
  modes: RouteModeDescriptor[],
): boolean {
  const byMode = new Map(modes.map(m => [m.mode, m]))
  return assignments.slice(0, -1).some(a => {
    const mode = effectiveRouteMode(a.route_mode_override, tripDefaultRouteMode)
    const desc = byMode.get(mode)
    return desc ? !desc.allowsOptimize : false
  })
}

/** @deprecated Use dayHasNonOptimizableLegsBeforeLast with route modes from the API. */
export function dayHasWaterwayLegsBeforeLast(
  assignments: Assignment[],
  tripDefaultRouteMode: unknown,
): boolean {
  return assignments.slice(0, -1).some(a =>
    effectiveRouteMode(a.route_mode_override, tripDefaultRouteMode) === 'waterway',
  )
}
