import {
  getMergedItems,
  getTransportForDay,
  getTransportRouteEndpoints,
} from './dayPlanMerge';

export type RouteLegMode = 'walking' | 'driving' | 'waterway';

export interface DayRouteAssignmentInput {
  id: number;
  order_index: number;
  route_mode_override?: string | null;
  place?: {
    lat?: number | null;
    lng?: number | null;
    place_time?: string | null;
  } | null;
}

export interface DayRouteDayInput {
  id: number;
  day_number?: number;
  date?: string | null;
}

export interface DayRouteReservationInput {
  id?: number;
  type?: string;
  day_id?: number | null;
  end_day_id?: number | null;
  assignment_id?: number | null;
  day_positions?: Record<string | number, number> | null;
  day_plan_position?: number | null;
  reservation_time?: string | null;
  reservation_end_time?: string | null;
  endpoints?: Array<{ role: string; lat?: number | null; lng?: number | null }>;
  metadata?: unknown;
}

export interface RoutePlaceWaypoint {
  assignmentId: number;
  lat: number;
  lng: number;
  routeModeOverride: string | null;
}

export interface DayRouteRun {
  waypoints: RoutePlaceWaypoint[];
}

export interface BuildDayRouteItineraryInput {
  dayId: number;
  days: DayRouteDayInput[];
  assignments: DayRouteAssignmentInput[];
  reservations: DayRouteReservationInput[];
  defaultRouteMode?: string | null;
}

export interface DayRouteItinerary {
  /** Place-only runs split at transport breakpoints (for OSRM / waterway routing). */
  runs: DayRouteRun[];
  /** Straight-line polylines including transport endpoint anchors (map preview). */
  straightSegments: [number, number][][];
}

const ROUTE_MODES = new Set<RouteLegMode>(['walking', 'driving', 'waterway']);

export function normalizeRouteMode(
  value: unknown,
  fallback: RouteLegMode = 'walking',
): RouteLegMode {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (ROUTE_MODES.has(s as RouteLegMode)) return s as RouteLegMode;
  return fallback;
}

export function parseRouteModeOverride(value: unknown): RouteLegMode | null {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim().toLowerCase();
  if (s === 'inherit') return null;
  if (ROUTE_MODES.has(s as RouteLegMode)) return s as RouteLegMode;
  return null;
}

/** assignment.route_mode_override ?? trip.default_route_mode ?? 'walking' */
export function effectiveRouteMode(
  assignmentOverride: unknown,
  tripDefault: unknown,
): RouteLegMode {
  return (
    parseRouteModeOverride(assignmentOverride) ??
    normalizeRouteMode(tripDefault, 'walking')
  );
}

export function buildDayRouteItinerary(
  input: BuildDayRouteItineraryInput,
): DayRouteItinerary {
  const { dayId, days, assignments, reservations } = input;
  const dayAssignmentIds = assignments.map((a) => a.id);
  const dayTransports = getTransportForDay({
    reservations,
    dayId,
    dayAssignmentIds,
    days,
  });

  const merged = getMergedItems({
    dayAssignments: assignments,
    dayNotes: [],
    dayTransports,
    dayId,
  }).filter((item) => item.type === 'place' || item.type === 'transport');

  const runs: DayRouteRun[] = [];
  const straightSegments: [number, number][][] = [];
  let currentRun: RoutePlaceWaypoint[] = [];
  let currentStraight: [number, number][] = [];

  const pushStraightPoint = (lat: number, lng: number): void => {
    const pt: [number, number] = [lat, lng];
    const last = currentStraight[currentStraight.length - 1];
    if (last && last[0] === pt[0] && last[1] === pt[1]) return;
    currentStraight.push(pt);
  };

  const flushStraight = (): void => {
    if (currentStraight.length >= 2)
      straightSegments.push([...currentStraight]);
    currentStraight = [];
  };

  const flushRun = (): void => {
    if (currentRun.length >= 2) runs.push({ waypoints: [...currentRun] });
    currentRun = [];
  };

  for (const item of merged) {
    if (item.type === 'place') {
      const a = item.data as DayRouteAssignmentInput;
      const lat = a.place?.lat;
      const lng = a.place?.lng;
      if (lat == null || lng == null) continue;
      currentRun.push({
        assignmentId: a.id,
        lat,
        lng,
        routeModeOverride: a.route_mode_override ?? null,
      });
      pushStraightPoint(lat, lng);
      continue;
    }

    if (item.type !== 'transport') continue;

    const { from, to } = getTransportRouteEndpoints(item.data, dayId);
    if (from) pushStraightPoint(from.lat, from.lng);
    flushStraight();
    flushRun();
    if (to) pushStraightPoint(to.lat, to.lng);
  }

  flushStraight();
  flushRun();

  return { runs, straightSegments };
}

export function legRouteModeForRun(
  run: DayRouteRun,
  legIndex: number,
  defaultRouteMode: unknown,
): RouteLegMode {
  const from = run.waypoints[legIndex];
  return effectiveRouteMode(from?.routeModeOverride, defaultRouteMode);
}
