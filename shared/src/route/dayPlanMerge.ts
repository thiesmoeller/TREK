export const TRANSPORT_TYPES = new Set([
  'flight',
  'train',
  'bus',
  'car',
  'taxi',
  'bicycle',
  'cruise',
  'ferry',
  'transport_other',
]);

export interface TransportEndpoint {
  role: string;
  lat?: number | null;
  lng?: number | null;
}

export interface TransportReservation {
  id?: number;
  type?: string;
  day_id?: number | null;
  end_day_id?: number | null;
  assignment_id?: number | null;
  day_positions?: Record<string | number, number> | null;
  day_plan_position?: number | null;
  reservation_time?: string | null;
  reservation_end_time?: string | null;
  endpoints?: TransportEndpoint[];
  metadata?: unknown;
}

export interface FlightLegMeta {
  dep_day_id?: number | null;
  arr_day_id?: number | null;
  dep_time?: string | null;
  arr_time?: string | null;
  day_positions?: Record<string | number, number>;
  from?: string | null;
  to?: string | null;
  airline?: string | null;
  flight_number?: string | null;
}

export interface DayAssignmentLike {
  id?: number;
  order_index: number;
  place?: {
    place_time?: string | null;
    lat?: number | null;
    lng?: number | null;
  } | null;
}

export interface DayNoteLike {
  sort_order?: number | null;
  time?: string | null;
}

export type ExpandedTransportReservation = TransportReservation & {
  __leg?: {
    index: number;
    total: number;
    from: string | null;
    to: string | null;
    airline: string | null;
    flight_number: string | null;
  };
};

export interface MergedItemBase {
  sortKey: number;
}

export type MergedItem =
  | (MergedItemBase & { type: 'place'; data: DayAssignmentLike })
  | (MergedItemBase & { type: 'note'; data: DayNoteLike })
  | (MergedItemBase & {
      type: 'transport';
      data: TransportReservation | ExpandedTransportReservation;
    });

export function parseTimeToMinutes(time?: string | null): number | null {
  if (!time) return null;
  if (time.includes('T')) {
    const timePart = time.split('T')[1];
    if (!timePart) return null;
    const [hRaw, mRaw] = timePart.split(':');
    const h = Number(hRaw);
    const m = Number(mRaw);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  }
  const parts = time.split(':').map(Number);
  if (parts.length >= 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
    return parts[0]! * 60 + parts[1]!;
  }
  return null;
}

export function getSpanPhase(
  r: { day_id?: number | null; end_day_id?: number | null },
  dayId: number,
): 'single' | 'start' | 'middle' | 'end' {
  const startDayId = r.day_id;
  const endDayId = r.end_day_id ?? startDayId;
  if (!startDayId || startDayId === endDayId) return 'single';
  if (dayId === startDayId) return 'start';
  if (dayId === endDayId) return 'end';
  return 'middle';
}

/**
 * The route waypoints a transport contributes on a given day, respecting multi-day spans.
 */
export function getTransportRouteEndpoints(
  r: Pick<TransportReservation, 'day_id' | 'end_day_id' | 'endpoints'>,
  dayId: number,
): {
  from: { lat: number; lng: number } | null;
  to: { lat: number; lng: number } | null;
} {
  const ep = (role: 'from' | 'to'): { lat: number; lng: number } | null => {
    const e = (r.endpoints || []).find((x) => x.role === role);
    return e && e.lat != null && e.lng != null
      ? { lat: e.lat, lng: e.lng }
      : null;
  };
  switch (getSpanPhase(r, dayId)) {
    case 'start':
      return { from: ep('from'), to: null };
    case 'end':
      return { from: null, to: ep('to') };
    case 'middle':
      return { from: null, to: null };
    default:
      return { from: ep('from'), to: ep('to') };
  }
}

export function getDisplayTimeForDay(
  r: Pick<
    TransportReservation,
    'day_id' | 'end_day_id' | 'reservation_time' | 'reservation_end_time'
  >,
  dayId: number,
): string | null {
  const phase = getSpanPhase(r, dayId);
  if (phase === 'end') return r.reservation_end_time || null;
  if (phase === 'middle') return null;
  return r.reservation_time || null;
}

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw))
    return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return typeof parsed === 'object' &&
        parsed != null &&
        !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function parseFlightLegs(r: TransportReservation): FlightLegMeta[] | null {
  if (r.type !== 'flight') return null;
  const meta = parseMetadata(r.metadata);
  const legs = meta.legs;
  if (Array.isArray(legs) && legs.length > 1) return legs as FlightLegMeta[];
  return null;
}

export function expandFlightLegsForDay(
  r: TransportReservation,
  dayId: number,
  getDayOrder: (id: number) => number,
  days: Array<{ id: number; date?: string | null }>,
): ExpandedTransportReservation[] {
  const legs = parseFlightLegs(r);
  if (!legs) return [r];
  const dateOf = (id: number | null): string | null =>
    id == null ? null : (days.find((d) => d.id === id)?.date ?? null);
  const thisOrder = getDayOrder(dayId);
  const out: ExpandedTransportReservation[] = [];
  legs.forEach((leg, i) => {
    const dep = leg.dep_day_id ?? r.day_id ?? null;
    const arr = leg.arr_day_id ?? dep;
    if (dep == null) return;
    const depOrder = getDayOrder(dep);
    const arrOrder = getDayOrder(arr ?? dep);
    if (!(thisOrder >= depOrder && thisOrder <= arrOrder)) return;
    const depDate = dateOf(dep);
    const arrDate = dateOf(arr ?? dep);
    out.push({
      ...r,
      day_id: dep,
      end_day_id: arr ?? dep,
      reservation_time: leg.dep_time
        ? depDate
          ? `${depDate}T${leg.dep_time}`
          : leg.dep_time
        : null,
      reservation_end_time: leg.arr_time
        ? arrDate
          ? `${arrDate}T${leg.arr_time}`
          : leg.arr_time
        : null,
      day_positions: leg.day_positions || undefined,
      day_plan_position: undefined,
      __leg: {
        index: i,
        total: legs.length,
        from: leg.from ?? null,
        to: leg.to ?? null,
        airline: leg.airline ?? null,
        flight_number: leg.flight_number ?? null,
      },
    });
  });
  return out;
}

/** Filter reservations that are active transports for the given day, excluding assignment-linked ones. */
export function getTransportForDay(opts: {
  reservations: TransportReservation[];
  dayId: number;
  dayAssignmentIds: number[];
  days: Array<{ id: number; day_number?: number; date?: string | null }>;
}): ExpandedTransportReservation[] {
  const { reservations, dayId, dayAssignmentIds, days } = opts;

  const getDayOrder = (id: number): number => {
    const d = days.find((x) => x.id === id);
    return d ? (d.day_number ?? days.indexOf(d)) : 0;
  };
  const thisDayOrder = getDayOrder(dayId);

  return reservations
    .filter((r) => {
      if (r.type === 'hotel') return false;
      if (r.assignment_id && dayAssignmentIds.includes(r.assignment_id))
        return false;

      const startDayId = r.day_id;
      const endDayId = r.end_day_id ?? startDayId;

      if (startDayId == null) return false;

      const spanEndDayId = endDayId ?? startDayId;

      if (spanEndDayId !== startDayId) {
        const startOrder = getDayOrder(startDayId);
        const endOrder = getDayOrder(spanEndDayId);
        return thisDayOrder >= startOrder && thisDayOrder <= endOrder;
      }
      return startDayId === dayId;
    })
    .flatMap((r) => expandFlightLegsForDay(r, dayId, getDayOrder, days));
}

function isAssignmentData(data: MergedItem['data']): data is DayAssignmentLike {
  return 'order_index' in data && 'place' in data;
}

function isNoteData(data: MergedItem['data']): data is DayNoteLike {
  return 'sort_order' in data || ('time' in data && !('order_index' in data));
}

function isTransportData(
  data: MergedItem['data'],
): data is TransportReservation {
  return 'type' in data || 'reservation_time' in data || 'day_id' in data;
}

function applyChronoOrder(
  items: MergedItem[],
  dayId: number,
  getDisplayTime: (r: TransportReservation, dayId: number) => string | null,
): MergedItem[] {
  const timeOf = (it: MergedItem): number | null => {
    if (it.type === 'place' && isAssignmentData(it.data))
      return parseTimeToMinutes(it.data.place?.place_time);
    if (it.type === 'note' && isNoteData(it.data))
      return parseTimeToMinutes(it.data.time);
    if (isTransportData(it.data))
      return parseTimeToMinutes(getDisplayTime(it.data, dayId));
    return null;
  };
  let last = -Infinity;
  return items
    .map((it, i) => {
      const t = timeOf(it);
      if (t != null) last = t;
      return { it, i, eff: t != null ? t : last };
    })
    .sort((a, b) => a.eff - b.eff || a.i - b.i)
    .map((k) => k.it);
}

/** Merge places, notes, and transports into a single ordered day timeline. */
export function getMergedItems(opts: {
  dayAssignments: DayAssignmentLike[];
  dayNotes: DayNoteLike[];
  dayTransports: TransportReservation[];
  dayId: number;
  getDisplayTime?: (r: TransportReservation, dayId: number) => string | null;
}): MergedItem[] {
  const {
    dayAssignments: da,
    dayNotes: dn,
    dayTransports: transport,
    dayId,
  } = opts;
  const getDisplayTime = opts.getDisplayTime ?? getDisplayTimeForDay;

  const baseItems: MergedItem[] = [
    ...da.map((a) => ({
      type: 'place' as const,
      sortKey: a.order_index,
      data: a,
    })),
    ...dn.map((n) => ({
      type: 'note' as const,
      sortKey: n.sort_order ?? 0,
      data: n,
    })),
  ].sort((a, b) => a.sortKey - b.sortKey);

  const timedTransports = transport
    .map((r) => ({
      type: 'transport' as const,
      data: r,
      minutes: parseTimeToMinutes(getDisplayTime(r, dayId)) ?? 0,
    }))
    .sort((a, b) => a.minutes - b.minutes);

  if (timedTransports.length === 0)
    return applyChronoOrder(baseItems, dayId, getDisplayTime);
  if (baseItems.length === 0) {
    return applyChronoOrder(
      timedTransports.map((item, i) => ({
        type: item.type,
        sortKey: i,
        data: item.data,
      })),
      dayId,
      getDisplayTime,
    );
  }

  const result = [...baseItems];
  for (let ti = 0; ti < timedTransports.length; ti++) {
    const timed = timedTransports[ti];
    if (!timed) continue;
    const minutes = timed.minutes;

    const perDayPos =
      timed.data.day_positions?.[dayId] ??
      timed.data.day_positions?.[String(dayId)];
    if (perDayPos != null) {
      result.push({ type: timed.type, sortKey: perDayPos, data: timed.data });
      continue;
    }
    if (timed.data.day_plan_position != null) {
      result.push({
        type: timed.type,
        sortKey: timed.data.day_plan_position,
        data: timed.data,
      });
      continue;
    }

    let insertAfterKey = -Infinity;
    for (const item of result) {
      if (item.type === 'place' && isAssignmentData(item.data)) {
        const pm = parseTimeToMinutes(item.data.place?.place_time);
        if (pm !== null && pm <= minutes) insertAfterKey = item.sortKey;
      } else if (item.type === 'transport' && isTransportData(item.data)) {
        const tm = parseTimeToMinutes(item.data.reservation_time);
        if (tm !== null && tm <= minutes) insertAfterKey = item.sortKey;
      }
    }

    const lastKey =
      result.length > 0 ? Math.max(...result.map((i) => i.sortKey)) : 0;
    const sortKey =
      insertAfterKey === -Infinity
        ? lastKey + 0.5 + ti * 0.01
        : insertAfterKey + 0.01 + ti * 0.001;

    result.push({ type: timed.type, sortKey, data: timed.data });
  }

  return applyChronoOrder(
    result.sort((a, b) => a.sortKey - b.sortKey),
    dayId,
    getDisplayTime,
  );
}
