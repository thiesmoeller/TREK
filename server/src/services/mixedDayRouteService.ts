import {
  BUILTIN_ROUTE_MODES,
  buildDayRouteItinerary,
  legRouteModeForRun,
  type DayRouteLeg,
  type MixedDayRoute,
} from '@trek/shared';
import { db } from '../db/database';
import { listReservations } from './reservationService';
import { listDayAssignments } from './assignmentService';
import { listAccommodations } from './dayService';
import { osrmLegRoute } from './routing/osrmRouting';
import { haversineMeters } from './routing/geo';
import { applyAccommodationBookends } from './routing/dayBookends';
function isBuiltinMode(mode: string): boolean {
  return (BUILTIN_ROUTE_MODES as readonly string[]).includes(mode.trim().toLowerCase());
}

export type { DayRouteLeg, MixedDayRoute };

export interface RouteLegDispatchRequest {
  mode: string;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  legKey: string;
  tripId: number;
  modeOptions?: Record<string, unknown>;
}

export interface RouteLegDispatchResult {
  coords: [number, number][];
  distanceM: number;
  durationS?: number;
}

export type RouteLegDispatcher = (
  req: RouteLegDispatchRequest,
  opts: { signal?: AbortSignal },
) => Promise<RouteLegDispatchResult>;

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError' || err.message === 'route_timeout' || err.message === 'route_cancelled');
}

function parseRouteModeOptions(json: string | null | undefined): Record<string, Record<string, unknown>> {
  try {
    const v = JSON.parse(json || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, Record<string, unknown>> : {};
  } catch {
    return {};
  }
}

function modeOptionsFor(tripOptions: Record<string, Record<string, unknown>>, mode: string): Record<string, unknown> {
  return tripOptions[mode] ?? {};
}

function fallbackDurationS(mode: string, distanceM: number, modeOptions: Record<string, unknown>): number {
  if (mode === 'driving') return distanceM / (40000 / 3600);
  if (!(BUILTIN_ROUTE_MODES as readonly string[]).includes(mode)) {
    const speedKmh = typeof modeOptions.speedKmh === 'number' ? modeOptions.speedKmh : 6;
    return distanceM / ((speedKmh * 1000) / 3600);
  }
  return distanceM / (5000 / 3600);
}

function osrmProfile(mode: string): 'walking' | 'driving' {
  return mode === 'driving' ? 'driving' : 'walking';
}

export async function computeMixedDayRoute(
  tripId: number,
  dayId: number,
  { signal, dispatchPluginLeg }: { signal?: AbortSignal; dispatchPluginLeg?: RouteLegDispatcher } = {},
): Promise<MixedDayRoute> {
  const tripRow = db.prepare(`
    SELECT id, default_route_mode, route_mode_options
    FROM trips WHERE id = ?
  `).get(tripId) as
    {
      id: number;
      default_route_mode: string | null;
      route_mode_options?: string | null;
    } | undefined;
  if (!tripRow) throw new Error('trip_not_found');

  const dayRow = db.prepare('SELECT id FROM days WHERE id = ? AND trip_id = ?').get(dayId, tripId) as { id: number } | undefined;
  if (!dayRow) throw new Error('day_not_found');

  const tripRouteModeOptions = parseRouteModeOptions(tripRow.route_mode_options);
  const defaultRouteMode = tripRow.default_route_mode ?? 'walking';

  const allDays = db.prepare('SELECT id, day_number, date FROM days WHERE trip_id = ? ORDER BY day_number ASC')
    .all(tripId) as { id: number; day_number: number; date?: string | null }[];
  const reservations = listReservations(tripId);
  const da = listDayAssignments(dayId).sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index);
  const accommodations = listAccommodations(tripId) as Array<{
    id: number;
    start_day_id: number;
    end_day_id: number;
    place_lat?: number | null;
    place_lng?: number | null;
  }>;

  const { runs: placeRuns } = buildDayRouteItinerary({
    dayId,
    days: allDays,
    assignments: da,
    reservations,
    defaultRouteMode,
  });

  const runs = applyAccommodationBookends(placeRuns, {
    dayId,
    days: allDays,
    assignments: da,
    reservations,
    accommodations,
  });

  const segments: [number, number][][] = [];
  const legs: DayRouteLeg[] = [];

  const routeLeg = async (
    from: { lat: number; lng: number; assignmentId: number },
    to: { lat: number; lng: number; assignmentId: number },
    mode: string,
    legKey: string,
  ): Promise<{ coords: [number, number][]; distanceM: number; durationS: number }> => {
    const legModeOptions = modeOptionsFor(tripRouteModeOptions, mode);
    if (isBuiltinMode(mode)) {
      const os = await osrmLegRoute(from.lat, from.lng, to.lat, to.lng, osrmProfile(mode), { signal });
      return { coords: os.coords, distanceM: os.distanceM, durationS: os.durationS };
    }
    if (dispatchPluginLeg) {
      const plugin = await dispatchPluginLeg({
        mode,
        from: { lat: from.lat, lng: from.lng },
        to: { lat: to.lat, lng: to.lng },
        legKey,
        tripId,
        modeOptions: legModeOptions,
      }, { signal });
      const durationS = plugin.durationS ?? fallbackDurationS(mode, plugin.distanceM, legModeOptions);
      return { coords: plugin.coords, distanceM: plugin.distanceM, durationS };
    }
    throw new Error('route_provider_not_found');
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
      const mode = legRouteModeForRun(seg, i, defaultRouteMode);
      const legKey = `d${dayId}-a${from.assignmentId}-t${to.assignmentId}`;
      const legModeOptions = modeOptionsFor(tripRouteModeOptions, mode);
      try {
        const { coords, distanceM, durationS } = await routeLeg(from, to, mode, legKey);
        appendCoords(poly, coords);
        const fromxy: [number, number] = [from.lat, from.lng];
        const toxy: [number, number] = [to.lat, to.lng];
        legs.push({
          polylineIndex: segIdx,
          routeMode: mode,
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
        const durationS = fallbackDurationS(mode, straightM, legModeOptions);
        const fromxy: [number, number] = [from.lat, from.lng];
        const toxy: [number, number] = [to.lat, to.lng];
        legs.push({
          polylineIndex: segIdx,
          routeMode: mode,
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
