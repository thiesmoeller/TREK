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

export interface WaterwayRoute {
  coords: LatLngTuple[];
  distanceM: number;
}

export interface WaterwayLegResult extends WaterwayRoute {
  warnings?: string[];
}
