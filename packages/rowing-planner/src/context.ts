import { bboxWithPadding, haversineMeters, planarPointToSegmentMeters } from './geo';
import type {
  LatLngTuple,
  OverpassClient,
  RowingPlan,
  RowingSchedule,
  RowingSettings,
  TidalDepartureWindow,
  TidalFeature,
  TideEvent,
  TideProvider,
  TideStation,
  WaterLevelProvider,
  WaterwayConditionObservation,
  WaterwayContext,
  WaterwayLockAnnotation,
  WaterwayRoute,
} from './types';

const LOCK_COMPLEX_DEDUPE_CHAINAGE_M = 500;
const LOCK_COMPLEX_DEDUPE_DISTANCE_M = 400;

export interface WaterwayContextOptions {
  overpassClient?: OverpassClient;
  tideProvider?: TideProvider | null;
  waterLevelProviders?: WaterLevelProvider[];
  settings?: RowingSettings;
  schedule?: RowingSchedule;
  signal?: AbortSignal;
  lockCorridorM?: number;
  tidalCorridorM?: number;
  contextBboxPadM?: number;
  cache?: Map<string, { at: number; data: unknown }>;
  cacheTtlMs?: number;
  cacheMax?: number;
}

type OsmElement = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

const defaultCache = new Map<string, { at: number; data: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();

function trimCache(cache: Map<string, { at: number; data: unknown }>, cacheMax: number): void {
  if (cache.size <= cacheMax) return;
  const sorted = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
  while (sorted.length > cacheMax) {
    const key = sorted.shift()?.[0];
    if (key) cache.delete(key);
  }
}

async function cached<T>(
  cache: Map<string, { at: number; data: unknown }>,
  cacheMax: number,
  cacheTtlMs: number,
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < cacheTtlMs) return hit.data as T;
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().then((data) => {
    cache.set(key, { at: Date.now(), data });
    trimCache(cache, cacheMax);
    inFlight.delete(key);
    return data;
  }, (err) => {
    inFlight.delete(key);
    throw err;
  });
  inFlight.set(key, p);
  return p;
}

export function routeLengthM(coords: LatLngTuple[]): number {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) total += haversineMeters(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
  return total;
}

export function routeBBox(coords: LatLngTuple[], padM = 1000) {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const [lat, lng] of coords) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lng);
    east = Math.max(east, lng);
  }
  if (!Number.isFinite(south)) return bboxWithPadding(0, 0, 0, 0, 0);
  return bboxWithPadding(south, west, north, east, padM);
}

export function routeMidpoint(coords: LatLngTuple[]): LatLngTuple {
  if (coords.length === 0) return [0, 0];
  const target = routeLengthM(coords) / 2;
  let chain = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const seg = haversineMeters(a[0], a[1], b[0], b[1]);
    if (chain + seg >= target) {
      const t = seg > 0 ? (target - chain) / seg : 0;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    chain += seg;
  }
  return coords[coords.length - 1];
}

export function projectPointToPolyline(
  lat: number,
  lng: number,
  coords: LatLngTuple[],
): { distanceM: number; chainageM: number; lat: number; lng: number } | null {
  if (coords.length < 2) return null;
  let best: { distanceM: number; chainageM: number; lat: number; lng: number } | null = null;
  let chain = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const segLen = haversineMeters(a[0], a[1], b[0], b[1]);
    const p = planarPointToSegmentMeters(lat, lng, a[0], a[1], b[0], b[1]);
    const candidate = {
      distanceM: p.d,
      chainageM: chain + segLen * p.t,
      lat: p.qLat,
      lng: p.qLng,
    };
    if (!best || candidate.distanceM < best.distanceM) best = candidate;
    chain += segLen;
  }
  return best;
}

function tagValue(tags: Record<string, string> | undefined, keys: string[]): string | undefined {
  if (!tags) return undefined;
  for (const key of keys) {
    const v = tags[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function normalizedLockLabel(name: string | null, ref: string | null): string | null {
  const label = (name || ref || '').trim().toLowerCase();
  return label || null;
}

function lockDetailScore(lock: Pick<WaterwayLockAnnotation, 'name' | 'ref' | 'tags'>): number {
  return [
    lock.name,
    lock.ref,
    lock.tags.opening_hours,
    lock.tags.phone,
    lock.tags.website,
    lock.tags.vhf,
  ].filter(Boolean).length;
}

function elementCoord(el: OsmElement): { lat: number; lng: number } | null {
  const lat = typeof el.lat === 'number' ? el.lat : el.center?.lat;
  const lon = typeof el.lon === 'number' ? el.lon : el.center?.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  return { lat, lng: lon };
}

export function extractLocksFromOsmElements(
  elements: unknown[],
  coords: LatLngTuple[],
  settings: RowingSettings = {},
  options: { lockCorridorM?: number } = {},
): WaterwayLockAnnotation[] {
  const locks: WaterwayLockAnnotation[] = [];
  const seen = new Set<string>();
  const lockCorridorM = options.lockCorridorM ?? 180;
  const defaultLockDelayMinutes = settings.defaultLockDelayMinutes ?? 15;
  for (const raw of elements) {
    const el = raw as OsmElement;
    if (!el || typeof el.id !== 'number' || !el.type) continue;
    const tags = el.tags || {};
    const isLock = tags.waterway === 'lock_gate' || tags.lock === 'yes' || tags.water === 'lock' || tags.lock_name != null;
    if (!isLock) continue;
    const coord = elementCoord(el);
    if (!coord) continue;
    const projected = projectPointToPolyline(coord.lat, coord.lng, coords);
    if (!projected || projected.distanceM > lockCorridorM) continue;
    const dedupeKey = `${el.type}:${el.id}`;
    if (seen.has(dedupeKey)) continue;
    const name = tagValue(tags, ['lock_name', 'seamark:name', 'name']) ?? null;
    const ref = tagValue(tags, ['ref']) ?? null;
    const annotation: WaterwayLockAnnotation = {
      id: dedupeKey,
      osmType: el.type,
      osmId: el.id,
      name,
      ref,
      lat: coord.lat,
      lng: coord.lng,
      chainageM: Math.round(projected.chainageM),
      delayS: Math.max(0, defaultLockDelayMinutes) * 60,
      tags: {
        opening_hours: tagValue(tags, ['opening_hours']),
        phone: tagValue(tags, ['phone', 'contact:phone']),
        website: tagValue(tags, ['website', 'contact:website']),
        vhf: tagValue(tags, ['vhf', 'contact:vhf', 'seamark:radio_station:channel']),
      },
    };
    const duplicateIndex = locks.findIndex(l => {
      const chainageDeltaM = Math.abs(l.chainageM - projected.chainageM);
      if (chainageDeltaM >= LOCK_COMPLEX_DEDUPE_CHAINAGE_M) return false;

      const sameName = normalizedLockLabel(name, ref) != null
        && normalizedLockLabel(name, ref) === normalizedLockLabel(l.name, l.ref);
      if (sameName) return true;

      const physicalDistanceM = haversineMeters(coord.lat, coord.lng, l.lat, l.lng);
      const currentHasDetails = !!(name || ref || tagValue(tags, ['opening_hours', 'phone', 'contact:phone', 'website', 'contact:website', 'vhf', 'contact:vhf', 'seamark:radio_station:channel']));
      const existingHasDetails = !!(l.name || l.ref || l.tags.opening_hours || l.tags.phone || l.tags.website || l.tags.vhf);

      return physicalDistanceM < LOCK_COMPLEX_DEDUPE_DISTANCE_M && (currentHasDetails || existingHasDetails);
    });
    if (duplicateIndex >= 0) {
      if (lockDetailScore(annotation) > lockDetailScore(locks[duplicateIndex])) {
        locks[duplicateIndex] = annotation;
      }
      continue;
    }
    seen.add(dedupeKey);
    locks.push(annotation);
  }
  locks.sort((a, b) => a.chainageM - b.chainageM);
  return locks;
}

export function extractTidalFeaturesFromOsmElements(
  elements: unknown[],
  coords: LatLngTuple[],
  options: { tidalCorridorM?: number } = {},
): TidalFeature[] {
  const features: TidalFeature[] = [];
  const seenNames = new Set<string>();
  const tidalCorridorM = options.tidalCorridorM ?? 1200;
  for (const raw of elements) {
    const el = raw as OsmElement;
    if (!el || typeof el.id !== 'number' || !el.type) continue;
    const tags = el.tags || {};
    if (String(tags.tidal || '').toLowerCase() !== 'yes' && tags.tidal !== '1') continue;
    const coord = elementCoord(el);
    if (!coord) continue;
    const projected = projectPointToPolyline(coord.lat, coord.lng, coords);
    if (!projected || projected.distanceM > tidalCorridorM) continue;
    const name = tagValue(tags, ['name', 'lock_name', 'seamark:name']) ?? null;
    const key = `${(name || `${el.type}:${el.id}`).toLowerCase()}:${Math.round(projected.chainageM / 1000)}`;
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    features.push({
      name,
      lat: coord.lat,
      lng: coord.lng,
      distanceM: Math.round(projected.distanceM),
      tags,
    });
  }
  return features;
}

async function fetchLocks(route: WaterwayRoute, overpassClient: OverpassClient, options: WaterwayContextOptions): Promise<WaterwayLockAnnotation[]> {
  const bbox = routeBBox(route.coords, options.contextBboxPadM ?? 1000);
  const spanLat = Math.abs(bbox.north - bbox.south);
  const spanLng = Math.abs(bbox.east - bbox.west);
  if (spanLat > 2.8 || spanLng > 2.8) throw new Error('lock_bbox_too_large');
  const cache = options.cache ?? defaultCache;
  const cacheTtlMs = options.cacheTtlMs ?? 1000 * 60 * 30;
  const cacheMax = options.cacheMax ?? 128;
  const key = `locks:${bbox.south.toFixed(3)}:${bbox.west.toFixed(3)}:${bbox.north.toFixed(3)}:${bbox.east.toFixed(3)}`;
  const data = await cached(cache, cacheMax, cacheTtlMs, key, async () => {
    const q = `
(
  node["waterway"="lock_gate"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["waterway"="lock_gate"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  relation["waterway"="lock_gate"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  node["lock"="yes"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["lock"="yes"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  relation["lock"="yes"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  node["water"="lock"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["water"="lock"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  relation["water"="lock"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
);
out center tags;
`;
    return overpassClient.fetchInterpreter(q.trim(), 25, { signal: options.signal });
  });
  return extractLocksFromOsmElements((data as { elements?: unknown[] })?.elements || [], route.coords, options.settings, { lockCorridorM: options.lockCorridorM });
}

async function fetchTidalFeatures(route: WaterwayRoute, overpassClient: OverpassClient, options: WaterwayContextOptions): Promise<TidalFeature[]> {
  const bbox = routeBBox(route.coords, options.contextBboxPadM ?? 1000);
  const spanLat = Math.abs(bbox.north - bbox.south);
  const spanLng = Math.abs(bbox.east - bbox.west);
  if (spanLat > 2.8 || spanLng > 2.8) throw new Error('tidal_bbox_too_large');
  const cache = options.cache ?? defaultCache;
  const cacheTtlMs = options.cacheTtlMs ?? 1000 * 60 * 30;
  const cacheMax = options.cacheMax ?? 128;
  const key = `tidal:${bbox.south.toFixed(3)}:${bbox.west.toFixed(3)}:${bbox.north.toFixed(3)}:${bbox.east.toFixed(3)}`;
  const data = await cached(cache, cacheMax, cacheTtlMs, key, async () => {
    const q = `
(
  way["tidal"="yes"]["waterway"~"^(river|canal|tidal_channel)$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["tidal"="1"]["waterway"~"^(river|canal|tidal_channel)$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["tidal"="yes"]["natural"="water"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["tidal"="1"]["natural"="water"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
);
out center tags;
`;
    return overpassClient.fetchInterpreter(q.trim(), 20, { signal: options.signal });
  });
  return extractTidalFeaturesFromOsmElements((data as { elements?: unknown[] })?.elements || [], route.coords, { tidalCorridorM: options.tidalCorridorM });
}

function bearingDeg(a: LatLngTuple, b: LatLngTuple): number {
  const lat1 = a[0] * Math.PI / 180;
  const lat2 = b[0] * Math.PI / 180;
  const dLon = (b[1] - a[1]) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function currentAdjustmentSeconds(
  distanceM: number,
  baseSpeedMps: number,
  from: LatLngTuple,
  to: LatLngTuple,
  observations: WaterwayConditionObservation[],
): number {
  const cur = observations.find(o => o.type === 'current' && typeof o.currentSpeedMps === 'number' && typeof o.currentDirectionDeg === 'number');
  if (!cur?.currentSpeedMps || cur.currentDirectionDeg == null || distanceM <= 0 || baseSpeedMps <= 0) return 0;
  const legBearing = bearingDeg(from, to);
  const angle = ((cur.currentDirectionDeg - legBearing + 540) % 360) - 180;
  const component = cur.currentSpeedMps * Math.cos(angle * Math.PI / 180);
  const capped = Math.max(-0.5, Math.min(0.5, component));
  const adjustedSpeed = Math.max(baseSpeedMps * 0.5, baseSpeedMps + capped);
  const baseS = distanceM / baseSpeedMps;
  const adjustedS = distanceM / adjustedSpeed;
  return Math.round(adjustedS - baseS);
}

export function rowingSpeedMps(settings: RowingSettings = {}): number {
  if (typeof settings.rowingSpeedMps === 'number' && settings.rowingSpeedMps > 0) return settings.rowingSpeedMps;
  const kmh = typeof settings.rowingSpeedKmh === 'number' && settings.rowingSpeedKmh > 0 ? settings.rowingSpeedKmh : 6;
  return (kmh * 1000) / 3600;
}

function isoDateFromSchedule(schedule?: RowingSchedule): string | null {
  if (schedule?.date) return schedule.date;
  if (schedule?.departureTime) return schedule.departureTime.slice(0, 10);
  return null;
}

function parseTimeOnDate(date: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(`${date}T${String(h || 0).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}:00.000Z`);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function isoNoMillis(date: Date): string {
  return date.toISOString().replace('.000Z', 'Z');
}

function findTidePhase(events: TideEvent[], atIso: string): { previousEvent?: TideEvent; nextEvent?: TideEvent } {
  const at = Date.parse(atIso);
  const sorted = [...events].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  let previousEvent: TideEvent | undefined;
  let nextEvent: TideEvent | undefined;
  for (const ev of sorted) {
    if (Date.parse(ev.time) <= at) previousEvent = ev;
    if (Date.parse(ev.time) > at) {
      nextEvent = ev;
      break;
    }
  }
  return { previousEvent, nextEvent };
}

export function suggestWindowsFromTideEvents(
  events: TideEvent[],
  date: string,
  settings: RowingSettings = {},
  station?: TideStation,
): TidalDepartureWindow[] {
  if (!station) return [];
  const preferredStart = parseTimeOnDate(date, settings.preferredWindowStart ?? '08:00');
  const preferredEnd = parseTimeOnDate(date, settings.preferredWindowEnd ?? '18:00');
  const buffer = settings.tideSafetyBufferMinutes ?? 30;
  const windows: TidalDepartureWindow[] = [];
  for (const event of events) {
    const eventTime = new Date(event.time);
    if (Number.isNaN(eventTime.getTime())) continue;
    const start = addMinutes(eventTime, buffer);
    const end = addMinutes(eventTime, 6 * 60 - buffer);
    const clippedStart = new Date(Math.max(start.getTime(), preferredStart.getTime()));
    const clippedEnd = new Date(Math.min(end.getTime(), preferredEnd.getTime()));
    if (clippedEnd <= clippedStart) continue;
    windows.push({
      start: isoNoMillis(clippedStart),
      end: isoNoMillis(clippedEnd),
      reason: event.kind === 'NW' ? 'after low water' : 'after high water',
      source: event.source,
      station,
      tideEvent: event,
    });
  }
  return windows.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

export async function suggestTidalDepartureWindows(
  route: WaterwayRoute,
  date: string,
  settings: RowingSettings = {},
  options: { tideProvider?: TideProvider | null; signal?: AbortSignal } = {},
): Promise<TidalDepartureWindow[]> {
  if (settings.tidalPlanningEnabled === false || !options.tideProvider) return [];
  const station = await options.tideProvider.getStationForRoute(route, { signal: options.signal });
  if (!station) return [];
  const events = await options.tideProvider.getTideEvents(station, date, { signal: options.signal });
  return suggestWindowsFromTideEvents(events, date, settings, station);
}

export function planRowingLeg(
  route: WaterwayRoute,
  settings: RowingSettings = {},
  schedule?: RowingSchedule,
  context: {
    locks?: WaterwayLockAnnotation[];
    conditions?: WaterwayConditionObservation[];
    from?: LatLngTuple;
    to?: LatLngTuple;
    tideEvents?: TideEvent[];
    tideStation?: TideStation | null;
    suggestedDepartureWindows?: TidalDepartureWindow[];
    warnings?: string[];
  } = {},
): RowingPlan {
  const speedMps = rowingSpeedMps(settings);
  const baseRowingDurationS = Math.round(route.distanceM / speedMps);
  const locks = context.locks ?? [];
  const conditions = context.conditions ?? [];
  const lockDelayS = locks.reduce((sum, l) => sum + l.delayS, 0);
  const from = context.from ?? route.coords[0];
  const to = context.to ?? route.coords[route.coords.length - 1];
  const flowAdjustmentS = from && to ? currentAdjustmentSeconds(route.distanceM, speedMps, from, to, conditions) : 0;
  const adjustedRowingDurationS = Math.max(60, Math.round(baseRowingDurationS + lockDelayS + flowAdjustmentS));
  const warnings = [...(context.warnings ?? [])];
  if (!conditions.some(o => o.type === 'current' && typeof o.currentSpeedMps === 'number' && typeof o.currentDirectionDeg === 'number')) {
    warnings.push('No reliable current velocity available; rowing speed was not flow-adjusted');
  }
  const departureTime = schedule?.departureTime;
  const tideEvents = context.tideEvents ?? [];
  const tideStation = context.tideStation ?? null;
  const tidePhase = departureTime && tideStation
    ? { station: tideStation, ...findTidePhase(tideEvents, departureTime) }
    : null;
  return {
    baseRowingDurationS,
    adjustedRowingDurationS,
    lockDelayS,
    flowAdjustmentS,
    warnings: [...new Set(warnings)],
    tidePhase,
    suggestedDepartureWindows: context.suggestedDepartureWindows ?? [],
  };
}

export async function getWaterwayContext(
  route: WaterwayRoute,
  options: WaterwayContextOptions = {},
): Promise<WaterwayContext> {
  const warnings: string[] = [];
  const settings = options.settings ?? {};
  let locks: WaterwayLockAnnotation[] = [];
  if (options.overpassClient) {
    try {
      locks = await fetchLocks(route, options.overpassClient, options);
    } catch {
      warnings.push('OSM lock annotations unavailable');
    }
  } else {
    warnings.push('OSM lock annotations unavailable');
  }

  let tidalFeatures: TidalFeature[] = [];
  if (options.overpassClient) {
    try {
      tidalFeatures = await fetchTidalFeatures(route, options.overpassClient, options);
      if (tidalFeatures.length > 0) {
        const names = [...new Set(tidalFeatures.map(f => f.name).filter(Boolean) as string[])].slice(0, 3);
        warnings.push(`Tidal waterway detected${names.length ? ` (${names.join(', ')})` : ''}; BSH tide timing can inform windows but does not provide exact current-speed ETA`);
      }
    } catch {
      warnings.push('OSM tidal annotations unavailable');
    }
  }

  const conditions: WaterwayConditionObservation[] = [];
  for (const provider of options.waterLevelProviders ?? []) {
    try {
      conditions.push(...await provider.getConditions(route, { signal: options.signal }));
    } catch {
      warnings.push(`${provider.name} unavailable`);
    }
  }
  if (conditions.some(o => o.modelBased)) warnings.push('Marine tide/current context is model-based and not navigation-grade');

  let tideStation: TideStation | null = null;
  let tideEvents: TideEvent[] = [];
  let suggestedDepartureWindows: TidalDepartureWindow[] = [];
  const date = isoDateFromSchedule(options.schedule);
  if (settings.tidalPlanningEnabled !== false && options.tideProvider && date) {
    try {
      tideStation = await options.tideProvider.getStationForRoute(route, { signal: options.signal });
      if (tideStation) {
        tideEvents = await options.tideProvider.getTideEvents(tideStation, date, { signal: options.signal });
        suggestedDepartureWindows = suggestWindowsFromTideEvents(tideEvents, date, settings, tideStation);
      }
    } catch {
      warnings.push(`${options.tideProvider.name} tide predictions unavailable`);
    }
  }

  const plan = planRowingLeg(route, settings, options.schedule, {
    locks,
    conditions,
    from: route.coords[0],
    to: route.coords[route.coords.length - 1],
    tideEvents,
    tideStation,
    suggestedDepartureWindows,
    warnings,
  });

  return {
    ...plan,
    locks,
    conditions,
    tidalFeatures,
    tideEvents,
    tideStation,
    tideSource: tideStation?.source ?? (options.tideProvider?.name ?? null),
  };
}
