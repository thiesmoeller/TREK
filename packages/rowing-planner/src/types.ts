import type { LatLngTuple, Coordinate, BBox } from './geo';

export type { LatLngTuple, Coordinate, BBox };

export interface CacheLike<T = unknown> {
  get(key: string): T | undefined;
  set(key: string, value: T, ttlMs?: number): void;
}

export interface PlannerLogger {
  warn?(message: string, meta?: Record<string, unknown>): void;
  info?(message: string, meta?: Record<string, unknown>): void;
}

export interface OverpassClient {
  fetchInterpreter(query: string, timeoutSeconds?: number, options?: { signal?: AbortSignal }): Promise<{ elements?: unknown[] }>;
}

export interface TideProvider {
  name: string;
  getStationForRoute(route: WaterwayRoute, options?: { signal?: AbortSignal }): Promise<TideStation | null>;
  getTideEvents(station: TideStation, date: string, options?: { signal?: AbortSignal }): Promise<TideEvent[]>;
}

export interface WaterLevelProvider {
  name: string;
  getConditions(route: WaterwayRoute, options?: { signal?: AbortSignal }): Promise<WaterwayConditionObservation[]>;
}

export interface WaterwayRoute {
  coords: LatLngTuple[];
  distanceM: number;
}

export interface WaterwayLegResult extends WaterwayRoute {
  warnings?: string[];
}

export interface WaterwayLockAnnotation {
  id: string;
  osmType: string;
  osmId: number;
  name: string | null;
  ref: string | null;
  lat: number;
  lng: number;
  chainageM: number;
  delayS: number;
  tags: {
    opening_hours?: string;
    phone?: string;
    website?: string;
    vhf?: string;
  };
}

export interface TidalFeature {
  name: string | null;
  lat: number;
  lng: number;
  distanceM: number;
  tags: Record<string, string>;
}

export type WaterwayConditionType = 'water_level' | 'discharge' | 'current' | 'tide';

export interface WaterwayConditionObservation {
  provider: string;
  label: string;
  type: WaterwayConditionType;
  value: number | null;
  unit: string | null;
  observedAt: string | null;
  stationName?: string | null;
  distanceM?: number | null;
  currentSpeedMps?: number | null;
  currentDirectionDeg?: number | null;
  modelBased?: boolean;
}

export interface TideStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  source: string;
  distanceM?: number | null;
  raw?: unknown;
}

export type TideEventKind = 'HW' | 'NW';

export interface TideEvent {
  stationId: string;
  stationName: string;
  source: string;
  kind: TideEventKind;
  time: string;
  heightM?: number | null;
}

export interface TidalDepartureWindow {
  start: string;
  end: string;
  reason: string;
  source: string;
  station: TideStation;
  tideEvent: TideEvent;
}

export interface RowingSettings {
  rowingSpeedKmh?: number;
  rowingSpeedMps?: number;
  defaultLockDelayMinutes?: number;
  tidalPlanningEnabled?: boolean;
  preferredWindowStart?: string;
  preferredWindowEnd?: string;
  tideSafetyBufferMinutes?: number;
}

export interface RowingSchedule {
  date?: string;
  departureTime?: string;
}

export interface RowingPlan {
  baseRowingDurationS: number;
  adjustedRowingDurationS: number;
  lockDelayS: number;
  flowAdjustmentS: number;
  warnings: string[];
  tidePhase?: {
    station: TideStation;
    previousEvent?: TideEvent;
    nextEvent?: TideEvent;
  } | null;
  suggestedDepartureWindows?: TidalDepartureWindow[];
}

export interface WaterwayContext extends RowingPlan {
  locks: WaterwayLockAnnotation[];
  conditions: WaterwayConditionObservation[];
  tidalFeatures: TidalFeature[];
  tideEvents: TideEvent[];
  tideStation: TideStation | null;
  tideSource: string | null;
}
