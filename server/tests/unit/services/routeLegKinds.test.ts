import { describe, it, expect } from 'vitest';
import { DEFAULT_ROUTE_LEG_KIND, normalizeRouteLegKind, parseAssignmentRouteLegOverride } from '../../../src/services/routeLegKinds';

describe('routeLegKinds', () => {
  it('normalizeRouteLegKind maps valid strings and defaults', () => {
    expect(normalizeRouteLegKind('waterway')).toBe('waterway');
    expect(normalizeRouteLegKind('walking')).toBe('walking');
    expect(normalizeRouteLegKind('driving')).toBe('driving');
    expect(normalizeRouteLegKind('WALKING')).toBe('walking');
    expect(normalizeRouteLegKind('invalid')).toBe(DEFAULT_ROUTE_LEG_KIND);
    expect(normalizeRouteLegKind(null)).toBe(DEFAULT_ROUTE_LEG_KIND);
  });

  it('parseAssignmentRouteLegOverride treats inherit as null', () => {
    expect(parseAssignmentRouteLegOverride('inherit')).toBe(null);
    expect(parseAssignmentRouteLegOverride(null)).toBe(null);
    expect(parseAssignmentRouteLegOverride('waterway')).toBe('waterway');
    expect(parseAssignmentRouteLegOverride('trail')).toBe(null);
  });
});
