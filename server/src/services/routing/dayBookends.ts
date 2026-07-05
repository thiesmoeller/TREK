import {
  getMergedItems,
  getTransportForDay,
  getTransportRouteEndpoints,
  type DayRouteAssignmentInput,
  type DayRouteDayInput,
  type DayRouteReservationInput,
  type DayRouteRun,
  type RoutePlaceWaypoint,
} from '@trek/shared';

export interface AccommodationWaypointSource {
  id: number;
  start_day_id: number;
  end_day_id: number;
  place_lat?: number | null;
  place_lng?: number | null;
}

type FlatPoint = { lat: number; lng: number };

type DayEntry =
  | { kind: 'place'; lat: number; lng: number }
  | { kind: 'transport'; from: FlatPoint | null; to: FlatPoint | null };

function getDayOrder(day: DayRouteDayInput, days: DayRouteDayInput[]): number {
  return day.day_number ?? days.findIndex((d) => d.id === day.id);
}

function isDayInAccommodationRange(
  day: DayRouteDayInput,
  startDayId: number,
  endDayId: number,
  days: DayRouteDayInput[],
): boolean {
  const startDay = days.find((d) => d.id === startDayId);
  const endDay = days.find((d) => d.id === endDayId);
  if (!startDay || !endDay) {
    return day.id >= Math.min(startDayId, endDayId) && day.id <= Math.max(startDayId, endDayId);
  }
  const lo = Math.min(getDayOrder(startDay, days), getDayOrder(endDay, days));
  const hi = Math.max(getDayOrder(startDay, days), getDayOrder(endDay, days));
  const ord = getDayOrder(day, days);
  return ord >= lo && ord <= hi;
}

function getDayBookendHotels(
  day: DayRouteDayInput,
  days: DayRouteDayInput[],
  accommodations: AccommodationWaypointSource[],
): {
  morning?: AccommodationWaypointSource;
  evening?: AccommodationWaypointSource;
  morningIsSleptHere?: boolean;
  eveningIsOvernight?: boolean;
} {
  const inRange = accommodations.filter(
    (a) =>
      a.place_lat != null &&
      a.place_lng != null &&
      isDayInAccommodationRange(day, a.start_day_id, a.end_day_id, days),
  );
  if (inRange.length === 0) return {};

  const dayOrd = getDayOrder(day, days);
  const orderOf = (id: number) => {
    const d = days.find((x) => x.id === id);
    return d ? getDayOrder(d, days) : dayOrd;
  };
  const checkIn = inRange.find((a) => a.start_day_id === day.id);
  const sleptHere = inRange.find((a) => orderOf(a.start_day_id) < dayOrd);

  return {
    morning: sleptHere ?? checkIn ?? inRange[0],
    evening: checkIn ?? sleptHere ?? inRange[0],
    morningIsSleptHere: sleptHere != null,
    eveningIsOvernight: checkIn != null || (sleptHere != null && orderOf(sleptHere.end_day_id) > dayOrd),
  };
}

function hotelPoint(a?: AccommodationWaypointSource): FlatPoint | null {
  if (!a || a.place_lat == null || a.place_lng == null) return null;
  return { lat: a.place_lat, lng: a.place_lng };
}

function hotelWaypoint(pt: FlatPoint): RoutePlaceWaypoint {
  return { assignmentId: 0, lat: pt.lat, lng: pt.lng, routeModeOverride: null };
}

function buildDayEntries(
  dayId: number,
  days: DayRouteDayInput[],
  assignments: DayRouteAssignmentInput[],
  reservations: DayRouteReservationInput[],
): DayEntry[] {
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

  const entries: DayEntry[] = [];
  for (const item of merged) {
    if (item.type === 'place') {
      const a = item.data as DayRouteAssignmentInput;
      const lat = a.place?.lat;
      const lng = a.place?.lng;
      if (lat == null || lng == null) continue;
      entries.push({ kind: 'place', lat, lng });
      continue;
    }
    const { from, to } = getTransportRouteEndpoints(item.data, dayId);
    entries.push({
      kind: 'transport',
      from: from ? { lat: from.lat, lng: from.lng } : null,
      to: to ? { lat: to.lat, lng: to.lng } : null,
    });
  }
  return entries;
}

function flatPoints(entries: DayEntry[]): FlatPoint[] {
  const pts: FlatPoint[] = [];
  for (const e of entries) {
    if (e.kind === 'place') pts.push({ lat: e.lat, lng: e.lng });
    else {
      if (e.from) pts.push(e.from);
      if (e.to) pts.push(e.to);
    }
  }
  return pts;
}

function firstLocatedWaypoint(
  entries: DayEntry[],
  assignments: DayRouteAssignmentInput[],
): RoutePlaceWaypoint | null {
  for (const e of entries) {
    if (e.kind === 'place') {
      const a = assignments.find((x) => x.place?.lat === e.lat && x.place?.lng === e.lng);
      return {
        assignmentId: a?.id ?? 0,
        lat: e.lat,
        lng: e.lng,
        routeModeOverride: a?.route_mode_override ?? null,
      };
    }
    if (e.from) return { assignmentId: 0, lat: e.from.lat, lng: e.from.lng, routeModeOverride: null };
    if (e.to) return { assignmentId: 0, lat: e.to.lat, lng: e.to.lng, routeModeOverride: null };
  }
  return null;
}

function lastLocatedWaypoint(
  entries: DayEntry[],
  assignments: DayRouteAssignmentInput[],
): RoutePlaceWaypoint | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.kind === 'place') {
      const a = assignments.find((x) => x.place?.lat === e.lat && x.place?.lng === e.lng);
      return {
        assignmentId: a?.id ?? 0,
        lat: e.lat,
        lng: e.lng,
        routeModeOverride: a?.route_mode_override ?? null,
      };
    }
    if (e.to) return { assignmentId: 0, lat: e.to.lat, lng: e.to.lng, routeModeOverride: null };
    if (e.from) return { assignmentId: 0, lat: e.from.lat, lng: e.from.lng, routeModeOverride: null };
  }
  return null;
}

/** Prepend/append accommodation bookend runs (hotel → first stop, last stop → hotel). */
export function applyAccommodationBookends(
  runs: DayRouteRun[],
  opts: {
    dayId: number;
    days: DayRouteDayInput[];
    assignments: DayRouteAssignmentInput[];
    reservations: DayRouteReservationInput[];
    accommodations: AccommodationWaypointSource[];
  },
): DayRouteRun[] {
  const day = opts.days.find((d) => d.id === opts.dayId);
  if (!day) return runs;

  const entries = buildDayEntries(opts.dayId, opts.days, opts.assignments, opts.reservations);
  const bookends = getDayBookendHotels(day, opts.days, opts.accommodations);
  const contributes = (e: DayEntry) => e.kind === 'place' || (e.kind === 'transport' && (!!e.from || !!e.to));
  const firstStop = entries.find(contributes);
  const lastStop = [...entries].reverse().find(contributes);
  const drawMorning = firstStop?.kind === 'place' || !!bookends.morningIsSleptHere;
  const drawEvening = lastStop?.kind === 'place' || !!bookends.eveningIsOvernight;
  const morningHotel = drawMorning ? hotelPoint(bookends.morning) : null;
  const eveningHotel = drawEvening ? hotelPoint(bookends.evening) : null;
  const firstWay = firstLocatedWaypoint(entries, opts.assignments);
  const lastWay = lastLocatedWaypoint(entries, opts.assignments);

  const out: DayRouteRun[] = [];
  if (morningHotel && firstWay) {
    out.push({ waypoints: [hotelWaypoint(morningHotel), firstWay] });
  }
  out.push(...runs);
  if (eveningHotel && lastWay) {
    out.push({ waypoints: [lastWay, hotelWaypoint(eveningHotel)] });
  }

  if (out.length === 0 && drawMorning && drawEvening && morningHotel && eveningHotel) {
    if (morningHotel.lat !== eveningHotel.lat || morningHotel.lng !== eveningHotel.lng) {
      out.push({ waypoints: [hotelWaypoint(morningHotel), hotelWaypoint(eveningHotel)] });
    }
  }

  return out;
}
