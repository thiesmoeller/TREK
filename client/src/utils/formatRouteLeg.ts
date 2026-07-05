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
  kind?: 'waterway' | 'walking' | 'driving' | string
  distanceM?: number
  durationS?: number
  isApproximate?: boolean
  waterwaySpeedKmh?: number
}

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string

export function formatRouteLegPill(
  t: TranslateFn,
  leg: RouteLegLabelInput,
): { waterwayText: string | null; walkingText: string; drivingText: string } {
  const distanceM = leg.distanceM ?? 0
  const durationS = leg.durationS ?? 0
  const distance = formatDistanceM(distanceM)
  const duration = formatDurationS(durationS)

  if (leg.kind === 'waterway') {
    const base = t('map.route.distanceDuration', { distance, duration })
    const waterwayText = leg.isApproximate
      ? t('map.route.fallbackWaterway', { distance, duration, speed: leg.waterwaySpeedKmh ?? 6 })
      : base
    return {
      waterwayText,
      walkingText: duration,
      drivingText: duration,
    }
  }

  return {
    waterwayText: null,
    walkingText: duration,
    drivingText: duration,
  }
}
