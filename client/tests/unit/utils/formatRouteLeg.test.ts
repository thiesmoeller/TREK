import { describe, expect, it } from 'vitest';
import {
  formatDistanceM,
  formatDurationS,
  formatRouteLegPill,
} from '../../../src/utils/formatRouteLeg';

const t = (key: string, vars?: Record<string, string | number>) => {
  const templates: Record<string, string> = {
    'map.route.distanceDuration': '{distance} · {duration}',
    'map.route.fallbackWaterway': '{distance} · {duration} ({speed} km/h waterway, approximate)',
  };
  let out = templates[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return out;
};

describe('formatRouteLeg', () => {
  it('formats distance and duration helpers', () => {
    expect(formatDistanceM(450)).toBe('450 m');
    expect(formatDistanceM(1500)).toBe('1.5 km');
    expect(formatDurationS(90)).toBe('1 min');
    expect(formatDurationS(7200)).toBe('2 h 0 min');
  });

  it('formats a walking leg pill from duration only', () => {
    const labels = formatRouteLegPill(t, { kind: 'walking', distanceM: 5000, durationS: 3600 });
    expect(labels.waterwayText).toBeNull();
    expect(labels.walkingText).toBe('1 h 0 min');
    expect(labels.drivingText).toBe('1 h 0 min');
  });

  it('formats a waterway leg with distance and duration', () => {
    const labels = formatRouteLegPill(t, {
      kind: 'waterway',
      distanceM: 36_000,
      durationS: 7200,
    });
    expect(labels.waterwayText).toBe('36.0 km · 2 h 0 min');
  });

  it('formats an approximate waterway leg', () => {
    const labels = formatRouteLegPill(t, {
      kind: 'waterway',
      distanceM: 10_000,
      durationS: 6000,
      isApproximate: true,
      waterwaySpeedKmh: 6,
    });
    expect(labels.waterwayText).toBe('10.0 km · 1 h 40 min (6 km/h waterway, approximate)');
  });
});
