import { db } from '../db/database';
import { listReservations } from './reservationService';
import { listDayAssignments } from './assignmentService';
import type { RouteLegKind } from './routeLegKinds';
import { DEFAULT_ROUTE_LEG_KIND, normalizeRouteLegKind, parseAssignmentRouteLegOverride } from './routeLegKinds';
import { osrmLegRoute } from './routing/osrmRouting';
import { routeWaterwayLeg } from './routing/waterwayRouting';
import { haversineMeters } from './routing/geo';
import { getWaterwayContextForLeg, type WaterwayContext } from './waterwayContextService';
import type { RowingSettings } from '@trek/rowing-planner';

const TRANSPORT_TYPES = ['flight', 'train', 'bus', 'car', 'cruise'] as const;

/** Assumed average speed for boat travel on plotted water routes (rowing/shell or similar small craft). */
const ROWING_ASSUMED_KMH = Number(process.env.TREK_ROWING_KMH ?? process.env.TREK_PADDLE_KMH ?? 6);

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

export interface DayRouteLegDto {
  polylineIndex: number;
  /** @deprecated Prefer client formatting from structured fields */
  rowingText: string | null;
  walkingText: string;
  drivingText: string;
  mid: [number, number];
  from: [number, number];
  to: [number, number];
  distanceM: number;
  durationS: number;
  lockDelayS: number;
  lockCount: number;
  isFallback: boolean;
  kind: RouteLegKind;
  waterwayContext?: WaterwayContext;
}

export interface MixedDayRouteDto {
  segments: [number, number][][];
  legs: DayRouteLegDto[];
}

interface PlaceSegPoint {
  assignmentId: number;
  lat: number;
  lng: number;
  routeLegOverride: RouteLegKind | null;
}

export async function computeMixedDayRoute(
  tripId: number,
  dayId: number,
  { signal }: { signal?: AbortSignal } = {},
): Promise<MixedDayRouteDto> {
  const tripRow = db.prepare(`
    SELECT id, is_rowing_trip, default_route_leg_kind, rowing_speed_kmh, rowing_lock_delay_min
    FROM trips WHERE id = ?
  `).get(tripId) as
    {
      id: number;
      is_rowing_trip?: number | boolean | null;
      default_route_leg_kind: string | null;
      rowing_speed_kmh?: number | null;
      rowing_lock_delay_min?: number | null;
    } | undefined;
  if (!tripRow) throw new Error('trip_not_found');

  const dayRow = db.prepare('SELECT id FROM days WHERE id = ? AND trip_id = ?').get(dayId, tripId) as { id: number } | undefined;
  if (!dayRow) throw new Error('day_not_found');

  const rowingEnabled = tripRow.is_rowing_trip === true || tripRow.is_rowing_trip === 1;
  const requestedDefaultKind = normalizeRouteLegKind(tripRow.default_route_leg_kind ?? DEFAULT_ROUTE_LEG_KIND);
  const defaultKind = rowingEnabled || requestedDefaultKind !== 'waterway' ? requestedDefaultKind : DEFAULT_ROUTE_LEG_KIND;
  const lockDelayDefault = Number(process.env.TREK_LOCK_DELAY_MIN ?? 15);
  const rowingSettings: RowingSettings = {
    rowingSpeedKmh: tripRow.rowing_speed_kmh ?? ROWING_ASSUMED_KMH,
    defaultLockDelayMinutes: tripRow.rowing_lock_delay_min ?? lockDelayDefault,
    tidalPlanningEnabled: false,
  };
  const rowingAssumedKmh = rowingSettings.rowingSpeedKmh ?? ROWING_ASSUMED_KMH;
  const rowingAssumedMps = (rowingAssumedKmh * 1000) / 3600;

  const allDays = db.prepare('SELECT id, day_number, date FROM days WHERE trip_id = ? ORDER BY day_number ASC')
    .all(tripId) as { id: number; day_number: number; date?: string | null }[];
  const dayOrder = (id: number | null | undefined): number | null => {
    if (id == null) return null;
    const d = allDays.find(x => x.id === id);
    return d ? d.day_number : null;
  };
  const thisOrder = dayOrder(dayId);
  const reservations = listReservations(tripId);
  const dayTransports = thisOrder == null ? [] : reservations.filter(r => {
    if (!(TRANSPORT_TYPES as readonly string[]).includes(r.type)) return false;
    const startId = r.day_id;
    if (startId == null) return false;
    const endId = r.end_day_id ?? startId;
    if (startId === endId) {
      if (startId !== dayId) return false;
    } else {
      const startOrd = dayOrder(startId);
      const endOrd = dayOrder(endId);
      if (startOrd == null || endOrd == null) return false;
      if (thisOrder < startOrd || thisOrder > endOrd) return false;
    }
    const pos = r.day_positions?.[dayId] ?? r.day_positions?.[String(dayId)] ?? r.day_plan_position;
    return pos != null;
  });

  const da = listDayAssignments(dayId).sort((a: any, b: any) => a.order_index - b.order_index);

  type Entry = { kind: 'place'; lat: number; lng: number; pos: number; assignment: typeof da[number] }
    | { kind: 'transport'; pos: number };

  const entries: (Entry & { pos: number })[] = [
    ...da.filter((a: any) => a.place?.lat && a.place?.lng).map((a: any) => ({
      kind: 'place' as const,
      lat: a.place.lat as number,
      lng: a.place.lng as number,
      pos: a.order_index as number,
      assignment: a,
    })),
    ...dayTransports.map(r => ({
      kind: 'transport' as const,
      pos: (r.day_positions?.[dayId] ?? r.day_positions?.[String(dayId)] ?? r.day_plan_position) as number,
    })),
  ].sort((a, b) => a.pos - b.pos);

  const segmentsRaw: PlaceSegPoint[][] = [];
  let cur: PlaceSegPoint[] = [];
  for (const entry of entries) {
    if (entry.kind === 'place') {
      const parsedOverride = parseAssignmentRouteLegOverride((entry as any).assignment.route_leg_override ?? null);
      const ovr = rowingEnabled || parsedOverride !== 'waterway' ? parsedOverride : null;
      cur.push({
        assignmentId: entry.assignment.id,
        lat: entry.lat,
        lng: entry.lng,
        routeLegOverride: ovr,
      });
    } else if (cur.length >= 2) {
      segmentsRaw.push([...cur]);
      cur = [];
    }
  }
  if (cur.length >= 2) segmentsRaw.push(cur);


  const segments: [number, number][][] = [];
  const legs: DayRouteLegDto[] = [];

  const routeLeg = async (
    from: PlaceSegPoint,
    to: PlaceSegPoint,
    kind: RouteLegKind,
    legKey: string,
  ): Promise<{ coords: [number, number][]; distanceM: number; durationS: number; baseDurationS: number; waterwayContext?: WaterwayContext }> => {
    if (kind === 'waterway') {
      const w = await routeWaterwayLeg(from.lat, from.lng, to.lat, to.lng, legKey, { signal });
      const baseDurationS = w.distanceM / rowingAssumedMps;
      let waterwayContext: WaterwayContext | undefined;
      try {
        waterwayContext = await getWaterwayContextForLeg({
          coords: w.coords,
          from: [from.lat, from.lng],
          to: [to.lat, to.lng],
          distanceM: w.distanceM,
          baseRowingDurationS: baseDurationS,
          rowingSpeedMps: rowingAssumedMps,
          settings: rowingSettings,
        });
      } catch {
        waterwayContext = {
          baseRowingDurationS: Math.round(baseDurationS),
          adjustedRowingDurationS: Math.round(baseDurationS),
          lockDelayS: 0,
          flowAdjustmentS: 0,
          locks: [],
          conditions: [],
          tidalFeatures: [],
          tideEvents: [],
          tideStation: null,
          tideSource: null,
          warnings: ['Waterway context unavailable'],
        };
      }
      return { coords: w.coords, distanceM: w.distanceM, durationS: waterwayContext.adjustedRowingDurationS, baseDurationS, waterwayContext };
    }
    const profile = kind === 'driving' ? 'driving' : 'walking';
    const os = await osrmLegRoute(from.lat, from.lng, to.lat, to.lng, profile, { signal });
    return {
      coords: os.coords,
      distanceM: os.distanceM,
      durationS: os.durationS,
      baseDurationS: os.durationS,
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

  for (let segIdx = 0; segIdx < segmentsRaw.length; segIdx++) {
    const seg = segmentsRaw[segIdx];
    const poly: [number, number][] = [];
    for (let i = 0; i < seg.length - 1; i++) {
      const from = seg[i];
      const to = seg[i + 1];
      const kind: RouteLegKind = from.routeLegOverride ?? defaultKind;
      const legKey = `d${dayId}-a${from.assignmentId}-t${to.assignmentId}`;
      try {
        const { coords, distanceM, durationS, waterwayContext } = await routeLeg(from, to, kind, legKey);
        appendCoords(poly, coords);
        const walkingDuration = kind === 'waterway'
          ? durationS
          : distanceM / (5000 / 3600);
        let drivingDuration = walkingDuration;
        try {
          const drive = await osrmLegRoute(from.lat, from.lng, to.lat, to.lng, 'driving', { signal });
          drivingDuration = drive.durationS;
        } catch { /* ignore */ }
        const fromxy: [number, number] = [from.lat, from.lng];
        const toxy: [number, number] = [to.lat, to.lng];
        const lockDelayS = waterwayContext?.lockDelayS ?? 0;
        const lockCount = waterwayContext?.locks?.length ?? 0;
        legs.push({
          polylineIndex: segIdx,
          kind,
          rowingText: kind === 'waterway'
            ? [
              `${formatDistance(distanceM)} · ${formatDuration(durationS)}`,
              lockDelayS ? `+${formatDuration(lockDelayS)} locks` : null,
            ].filter(Boolean).join(' · ')
            : null,
          walkingText: formatDuration(walkingDuration),
          drivingText: formatDuration(drivingDuration),
          mid: midAlong(coords.length >= 2 ? coords : [fromxy, toxy]),
          from: fromxy,
          to: toxy,
          distanceM,
          durationS,
          lockDelayS,
          lockCount,
          isFallback: false,
          ...(waterwayContext ? { waterwayContext } : {}),
        });
      } catch (_e: unknown) {
        poly.push([from.lat, from.lng]);
        poly.push([to.lat, to.lng]);
        const straightM = haversineMeters(from.lat, from.lng, to.lat, to.lng);
        const durationS = kind === 'waterway'
          ? straightM / rowingAssumedMps
          : straightM / (5000 / 3600);
        let drivingDuration = straightM / (5000 / 3600);
        try {
          const drive = await osrmLegRoute(from.lat, from.lng, to.lat, to.lng, 'driving', { signal });
          drivingDuration = drive.durationS;
        } catch { /* ignore */ }
        const fromxy: [number, number] = [from.lat, from.lng];
        const toxy: [number, number] = [to.lat, to.lng];
        const waterwayContext: WaterwayContext | undefined = kind === 'waterway'
          ? {
            baseRowingDurationS: Math.round(durationS),
            adjustedRowingDurationS: Math.round(durationS),
            lockDelayS: 0,
            flowAdjustmentS: 0,
            locks: [],
            conditions: [],
            tidalFeatures: [],
            tideEvents: [],
            tideStation: null,
            tideSource: null,
            warnings: ['Straight-line fallback; waterway context unavailable'],
          }
          : undefined;
        legs.push({
          polylineIndex: segIdx,
          kind,
          rowingText: kind === 'waterway'
            ? `${formatDistance(straightM)} · ${formatDuration(durationS)} (${rowingAssumedKmh} km/h rowing, fallback)`
            : null,
          walkingText: formatDuration(durationS),
          drivingText: formatDuration(drivingDuration),
          mid: [(from.lat + to.lat) / 2, (from.lng + to.lng) / 2],
          from: fromxy,
          to: toxy,
          distanceM: straightM,
          durationS,
          lockDelayS: 0,
          lockCount: 0,
          isFallback: true,
          ...(waterwayContext ? { waterwayContext } : {}),
        });
      }
    }
    if (poly.length >= 2) segments.push(poly);
  }

  return { segments, legs };
}
