import { haversineMeters } from './geo';
import { routeMidpoint } from './context';
import type { TideEvent, TideEventKind, TideProvider, TideStation, WaterwayRoute } from './types';

export interface BshTideProviderOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  cache?: Map<string, { at: number; data: unknown }>;
  cacheTtlMs?: number;
}

type BshStationRaw = Record<string, unknown>;

const defaultCache = new Map<string, { at: number; data: unknown }>();

function rawString(raw: BshStationRaw, keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function rawNumber(raw: BshStationRaw, keys: string[]): number | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function normalizeStation(raw: BshStationRaw): TideStation | null {
  const id = rawString(raw, ['bshnr', 'bshNr', 'id', 'station_id', 'number', 'nr']);
  const name = rawString(raw, ['name', 'station', 'stationName', 'bez', 'ort']);
  const lat = rawNumber(raw, ['lat', 'latitude', 'LAT', 'Latitude', 'y']);
  const lng = rawNumber(raw, ['lon', 'lng', 'longitude', 'LON', 'Longitude', 'x']);
  if (!id || !name || typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { id, name, lat, lng, source: 'BSH', raw };
}

function extractStationArray(data: unknown): BshStationRaw[] {
  if (Array.isArray(data)) return data as BshStationRaw[];
  if (!data || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  for (const key of ['stations', 'tides', 'data', 'items']) {
    const value = obj[key];
    if (Array.isArray(value)) return value as BshStationRaw[];
  }
  return Object.values(obj).filter(v => v && typeof v === 'object') as BshStationRaw[];
}

function normalizeKind(value: unknown): TideEventKind | null {
  const s = String(value ?? '').trim().toUpperCase();
  if (['HW', 'H', 'HIGH', 'HOCHWASSER'].includes(s)) return 'HW';
  if (['NW', 'N', 'LOW', 'NIEDRIGWASSER'].includes(s)) return 'NW';
  return null;
}

function parseDateTime(raw: Record<string, unknown>, fallbackDate?: string): string | null {
  for (const key of ['time', 'datetime', 'dateTime', 'timestamp', 'valid_time']) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) {
      const s = value.trim();
      const parsed = Date.parse(s);
      if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
      if (fallbackDate && /^\d{1,2}:\d{2}/.test(s)) {
        const parsedTime = Date.parse(`${fallbackDate}T${s.slice(0, 5)}:00+01:00`);
        if (Number.isFinite(parsedTime)) return new Date(parsedTime).toISOString();
      }
    }
  }
  const date = rawString(raw, ['date', 'datum']) ?? fallbackDate ?? null;
  const time = rawString(raw, ['hour', 'uhrzeit', 'zeit']) ?? null;
  if (date && time) {
    const parsed = Date.parse(`${date}T${time.slice(0, 5)}:00+01:00`);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

function extractEventsArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (!data || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  for (const key of ['events', 'tides', 'data', 'items', 'predictions']) {
    const value = obj[key];
    if (Array.isArray(value)) return value as Record<string, unknown>[];
  }
  return Object.values(obj).filter(v => v && typeof v === 'object') as Record<string, unknown>[];
}

function normalizeEvent(raw: Record<string, unknown>, station: TideStation, fallbackDate: string): TideEvent | null {
  const kind = normalizeKind(raw.type ?? raw.kind ?? raw.event ?? raw.hw_nw ?? raw.tide);
  const time = parseDateTime(raw, fallbackDate);
  if (!kind || !time) return null;
  const heightM = rawNumber(raw, ['height', 'heightM', 'value', 'wasserstand', 'w']) ?? null;
  return {
    stationId: station.id,
    stationName: station.name,
    source: 'BSH',
    kind,
    time,
    heightM,
  };
}

export class BshTideProvider implements TideProvider {
  readonly name = 'BSH';
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly cache: Map<string, { at: number; data: unknown }>;
  private readonly cacheTtlMs: number;

  constructor(options: BshTideProviderOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'https://gezeiten.bsh.de';
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.cache = options.cache ?? defaultCache;
    this.cacheTtlMs = options.cacheTtlMs ?? 1000 * 60 * 60 * 12;
  }

  private async getJson(path: string, signal?: AbortSignal): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const hit = this.cache.get(url);
    const now = Date.now();
    if (hit && now - hit.at < this.cacheTtlMs) return hit.data;
    const res = await this.fetchImpl(url, { signal });
    if (!res.ok) throw new Error('bsh_unavailable');
    const data = await res.json();
    this.cache.set(url, { at: now, data });
    return data;
  }

  async listStations(options: { signal?: AbortSignal } = {}): Promise<TideStation[]> {
    const data = await this.getJson('/data/tides_overview.json', options.signal);
    return extractStationArray(data).map(normalizeStation).filter(Boolean) as TideStation[];
  }

  async getStationForRoute(route: WaterwayRoute, options: { signal?: AbortSignal } = {}): Promise<TideStation | null> {
    const stations = await this.listStations(options);
    if (stations.length === 0) return null;
    const [lat, lng] = routeMidpoint(route.coords);
    let best: TideStation | null = null;
    let bestDistance = Infinity;
    for (const station of stations) {
      const distanceM = haversineMeters(lat, lng, station.lat, station.lng);
      if (distanceM < bestDistance) {
        bestDistance = distanceM;
        best = { ...station, distanceM: Math.round(distanceM) };
      }
    }
    return best;
  }

  async getTideEvents(station: TideStation, date: string, options: { signal?: AbortSignal } = {}): Promise<TideEvent[]> {
    const data = await this.getJson(`/data/DE_${station.id}_tides.json`, options.signal);
    const day = date.slice(0, 10);
    return extractEventsArray(data)
      .map(raw => normalizeEvent(raw, station, day))
      .filter((event): event is TideEvent => !!event && event.time.slice(0, 10) === day)
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  }
}
