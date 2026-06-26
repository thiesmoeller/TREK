import {
  buildDayRouteItinerary,
  legRouteModeForRun,
  type DayRouteLeg,
  type MixedDayRoute,
} from '@trek/shared';
import { db } from '../db/database';
import { listReservations } from './reservationService';
import { listDayAssignments } from './assignmentService';
import type { RouteLegKind } from './routeLegKinds';
import { DEFAULT_ROUTE_LEG_KIND, normalizeRouteLegKind } from './routeLegKinds';
import { osrmLegRoute } from './routing/osrmRouting';
import { routeWaterwayLeg } from './routing/waterwayRouting';
import { haversineMeters } from '@trek/waterway-routing';

/** Planning fallback speed for waterway routes when a trip does not set one. */
const WATERWAY_ASSUMED_KMH = Number(process.env.TREK_WATERWAY_SPEED_KMH ?? 6);

export type { DayRouteLeg, MixedDayRoute };

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError' || err.message === 'route_timeout' || err.message === 'route_cancelled');
}

export async function computeMixedDayRoute(
  tripId: number,
  dayId: number,
  { signal }: { signal?: AbortSignal } = {},
): Promise<MixedDayRoute> {
  const tripRow = db.prepare(`
    SELECT id, default_route_mode, waterway_speed_kmh
    FROM trips WHERE id = ?
  `).get(tripId) as
    {
      id: number;
      default_route_mode: string | null;
      waterway_speed_kmh?: number | null;
    } | undefined;
  if (!tripRow) throw new Error('trip_not_found');

  const dayRow = db.prepare('SELECT id FROM days WHERE id = ? AND trip_id = ?').get(dayId, tripId) as { id: number } | undefined;
  if (!dayRow) throw new Error('day_not_found');

  const waterwayAssumedKmh = tripRow.waterway_speed_kmh ?? WATERWAY_ASSUMED_KMH;
  const waterwayAssumedMps = (waterwayAssumedKmh * 1000) / 3600;

  const allDays = db.prepare('SELECT id, day_number, date FROM days WHERE trip_id = ? ORDER BY day_number ASC')
    .all(tripId) as { id: number; day_number: number; date?: string | null }[];
  const reservations = listReservations(tripId);
  const da = listDayAssignments(dayId).sort((a: any, b: any) => a.order_index - b.order_index);

  const { runs } = buildDayRouteItinerary({
    dayId,
    days: allDays,
    assignments: da,
    reservations,
    defaultRouteMode: tripRow.default_route_mode,
  });

  const segments: [number, number][][] = [];
  const legs: DayRouteLeg[] = [];

  const routeLeg = async (
    from: { lat: number; lng: number; assignmentId: number },
    to: { lat: number; lng: number; assignmentId: number },
    kind: RouteLegKind,
    legKey: string,
  ): Promise<{ coords: [number, number][]; distanceM: number; durationS: number }> => {
    if (kind === 'waterway') {
      const w = await routeWaterwayLeg(from.lat, from.lng, to.lat, to.lng, legKey, { signal });
      return { coords: w.coords, distanceM: w.distanceM, durationS: w.distanceM / waterwayAssumedMps };
    }
    const profile = kind === 'driving' ? 'driving' : 'walking';
    const os = await osrmLegRoute(from.lat, from.lng, to.lat, to.lng, profile, { signal });
    return {
      coords: os.coords,
      distanceM: os.distanceM,
      durationS: os.durationS,
    };
  };

  const appendCoords = (poly: [number, number][], more: [number, number][]): void => {
    if (more.length === 0) return;
    const first = more[0];
    const last = poly[poly.length - 1];
    if (last && last[0] === first[0] && last[1] === first[1]) {
      poly.push(...more.slice(1));
    } else {
      poly.push(...more);
    }
  };

  const midAlong = (coords: [number, number][]): [number, number] => {
    if (coords.length <= 2) return [(coords[0][0] + coords[coords.length - 1][0]) / 2, (coords[0][1] + coords[coords.length - 1][1]) / 2];
    let sum = 0;
    const dists: number[] = [0];
    for (let i = 0; i < coords.length - 1; i++) {
      const d = haversineMeters(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
      sum += d;
      dists.push(sum);
    }
    const mid = sum / 2;
    for (let i = 0; i < dists.length - 1; i++) {
      if (mid <= dists[i + 1]) {
        const segStart = dists[i];
        const segEnd = dists[i + 1];
        const t = segEnd > segStart ? (mid - segStart) / (segEnd - segStart) : 0;
        const a = coords[i];
        const b = coords[i + 1];
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      }
    }
    return coords[Math.floor(coords.length / 2)];
  };

  for (let segIdx = 0; segIdx < runs.length; segIdx++) {
    const seg = runs[segIdx];
    const poly: [number, number][] = [];
    for (let i = 0; i < seg.waypoints.length - 1; i++) {
      const from = seg.waypoints[i];
      const to = seg.waypoints[i + 1];
      const kind: RouteLegKind = normalizeRouteLegKind(
        legRouteModeForRun(seg, i, tripRow.default_route_mode ?? DEFAULT_ROUTE_LEG_KIND),
      );
      const legKey = `d${dayId}-a${from.assignmentId}-t${to.assignmentId}`;
      try {
        const { coords, distanceM, durationS } = await routeLeg(from, to, kind, legKey);
        appendCoords(poly, coords);
        const fromxy: [number, number] = [from.lat, from.lng];
        const toxy: [number, number] = [to.lat, to.lng];
        legs.push({
          polylineIndex: segIdx,
          routeMode: kind,
          mid: midAlong(coords.length >= 2 ? coords : [fromxy, toxy]),
          from: fromxy,
          to: toxy,
          distanceM,
          durationS,
          isApproximate: false,
        });
      } catch (e: unknown) {
        if (signal?.aborted || isAbortError(e)) throw e;
        poly.push([from.lat, from.lng]);
        poly.push([to.lat, to.lng]);
        const straightM = haversineMeters(from.lat, from.lng, to.lat, to.lng);
        const durationS = kind === 'waterway'
          ? straightM / waterwayAssumedMps
          : straightM / (5000 / 3600);
        const fromxy: [number, number] = [from.lat, from.lng];
        const toxy: [number, number] = [to.lat, to.lng];
        legs.push({
          polylineIndex: segIdx,
          routeMode: kind,
          mid: [(from.lat + to.lat) / 2, (from.lng + to.lng) / 2],
          from: fromxy,
          to: toxy,
          distanceM: straightM,
          durationS,
          isApproximate: true,
        });
      }
    }
    if (poly.length >= 2) segments.push(poly);
  }

  return { segments, legs };
}
