import { db } from '../db/database';
import { osrmLegRoute } from './routing/osrmRouting';
import { haversineMeters } from './routing/geo';

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export interface GearShuttleLegDto {
  polylineIndex: number;
  mid: [number, number];
  distanceM: number;
  durationS: number;
  /** @deprecated Prefer client formatting from distanceM / durationS */
  distanceText: string;
  /** @deprecated Prefer client formatting from distanceM / durationS */
  durationText: string;
}

export interface GearShuttleRouteDto {
  segments: [number, number][][];
  legs: GearShuttleLegDto[];
}

/**
 * Companion bus style legs: successive accommodations with geocoded places,
 * sorted by stay start day id.
 */
export async function computeGearShuttleRoutes(
  tripId: number,
  { signal }: { signal?: AbortSignal } = {},
): Promise<GearShuttleRouteDto | { error: string }> {
  const rows = db.prepare(`
    SELECT a.id as acc_id, a.start_day_id, a.place_id, p.lat as place_lat, p.lng as place_lng,
           p.name as place_name
    FROM day_accommodations a
    LEFT JOIN places p ON a.place_id = p.id
    WHERE a.trip_id = ?
    ORDER BY a.start_day_id ASC, a.id ASC
  `).all(tripId) as {
    acc_id: number;
    start_day_id: number;
    place_id: number | null;
    place_lat: number | null;
    place_lng: number | null;
    place_name: string | null;
  }[];

  const withCoords = rows.filter(r =>
    r.place_lat != null && r.place_lng != null &&
    typeof r.place_lat === 'number' && typeof r.place_lng === 'number',
  );
  if (withCoords.length < 2) {
    return { segments: [], legs: [] };
  }

  const segments: [number, number][][] = [];
  const legs: GearShuttleLegDto[] = [];

  for (let i = 0; i < withCoords.length - 1; i++) {
    const from = withCoords[i];
    const to = withCoords[i + 1];
    const fa = [from.place_lat!, from.place_lng!] as [number, number];
    const tb = [to.place_lat!, to.place_lng!] as [number, number];
    try {
      const drv = await osrmLegRoute(fa[0], fa[1], tb[0], tb[1], 'driving', { signal });
      segments.push(drv.coords);
      legs.push({
        polylineIndex: segments.length - 1,
        mid: drv.coords.length >= 2
          ? drv.coords[Math.floor(drv.coords.length / 2)]!
          : [(fa[0] + tb[0]) / 2, (fa[1] + tb[1]) / 2],
        distanceM: drv.distanceM,
        durationS: drv.durationS,
        distanceText: formatDistance(drv.distanceM),
        durationText: formatDuration(drv.durationS),
      });
    } catch {
      segments.push([[fa[0], fa[1]], [tb[0], tb[1]]]);
      const d = haversineMeters(fa[0], fa[1], tb[0], tb[1]);
      const durationS = d / (40000 / 3600);
      legs.push({
        polylineIndex: segments.length - 1,
        mid: [(fa[0] + tb[0]) / 2, (fa[1] + tb[1]) / 2],
        distanceM: d,
        durationS,
        distanceText: formatDistance(d),
        durationText: formatDuration(durationS),
      });
    }
  }

  return { segments, legs };
}
