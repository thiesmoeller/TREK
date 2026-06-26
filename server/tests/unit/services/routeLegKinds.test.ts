import { describe, it, expect } from 'vitest';
import { DEFAULT_ROUTE_LEG_KIND, normalizeRouteLegKind, parseAssignmentRouteModeOverride } from '../../../src/services/routeLegKinds';

describe('routeLegKinds', () => {
  it('normalizeRouteLegKind maps valid strings and defaults', () => {
    expect(normalizeRouteLegKind('waterway')).toBe('waterway');
    expect(normalizeRouteLegKind('walking')).toBe('walking');
    expect(normalizeRouteLegKind('driving')).toBe('driving');
    expect(normalizeRouteLegKind('WALKING')).toBe('walking');
    expect(normalizeRouteLegKind('invalid')).toBe(DEFAULT_ROUTE_LEG_KIND);
    expect(normalizeRouteLegKind(null)).toBe(DEFAULT_ROUTE_LEG_KIND);
  });

  it('parseAssignmentRouteModeOverride treats inherit as null', () => {
    expect(parseAssignmentRouteModeOverride('inherit')).toBe(null);
    expect(parseAssignmentRouteModeOverride(null)).toBe(null);
    expect(parseAssignmentRouteModeOverride('waterway')).toBe('waterway');
    expect(parseAssignmentRouteModeOverride('trail')).toBe(null);
  });
});
