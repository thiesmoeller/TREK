export const ROUTE_LEG_KINDS = ['waterway', 'walking', 'driving'] as const;
export type RouteLegKind = (typeof ROUTE_LEG_KINDS)[number];

export const DEFAULT_ROUTE_LEG_KIND: RouteLegKind = 'walking';

export function normalizeRouteLegKind(value: unknown): RouteLegKind {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (s === 'waterway' || s === 'walking' || s === 'driving') return s;
  return DEFAULT_ROUTE_LEG_KIND;
}

export function parseAssignmentRouteModeOverride(value: unknown): RouteLegKind | null {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim().toLowerCase();
  if (s === 'inherit') return null;
  if (s === 'waterway' || s === 'walking' || s === 'driving') return s;
  return null;
}
