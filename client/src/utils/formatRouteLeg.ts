export function formatDistanceM(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

export function formatDurationS(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h} h ${m} min`
  return `${m} min`
}

export type RouteLegLabelInput = {
  kind?: 'waterway' | 'walking' | 'driving'
  distanceM?: number
  durationS?: number
  lockDelayS?: number
  isFallback?: boolean
  rowingSpeedKmh?: number
}

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string

export function formatRouteLegPill(
  t: TranslateFn,
  leg: RouteLegLabelInput,
): { rowingText: string | null; walkingText: string; drivingText: string } {
  const distanceM = leg.distanceM ?? 0
  const durationS = leg.durationS ?? 0
  const distance = formatDistanceM(distanceM)
  const duration = formatDurationS(durationS)

  if (leg.kind === 'waterway') {
    const base = t('map.route.distanceDuration', { distance, duration })
    const lockPart = leg.lockDelayS && leg.lockDelayS > 0
      ? t('map.route.lockDelay', { delay: formatDurationS(leg.lockDelayS) })
      : null
    const rowingText = leg.isFallback
      ? t('map.route.fallbackRowing', { distance, duration, speed: leg.rowingSpeedKmh ?? 6 })
      : [base, lockPart].filter(Boolean).join(' · ')
    return {
      rowingText,
      walkingText: duration,
      drivingText: duration,
    }
  }

  return {
    rowingText: null,
    walkingText: duration,
    drivingText: duration,
  }
}

export function formatGearShuttlePill(t: TranslateFn, distanceM: number, durationS: number): string {
  return t('map.route.gearShuttle', {
    distance: formatDistanceM(distanceM),
    duration: formatDurationS(durationS),
  })
}
