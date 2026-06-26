import { describe, it, expect } from 'vitest';
import { buildAssignment, buildPlace } from '../../helpers/factories';
import { dayHasWaterwayLegsBeforeLast } from '../../../src/utils/routeMode';

describe('dayHasWaterwayLegsBeforeLast', () => {
  it('FE-ROUTE-MODE-001: returns false for walking trip default with no overrides', () => {
    const assignments = [
      buildAssignment({ order_index: 0, place: buildPlace({ lat: 1, lng: 1 }) }),
      buildAssignment({ order_index: 1, place: buildPlace({ lat: 2, lng: 2 }) }),
      buildAssignment({ order_index: 2, place: buildPlace({ lat: 3, lng: 3 }) }),
    ];
    expect(dayHasWaterwayLegsBeforeLast(assignments, 'walking')).toBe(false);
  });

  it('FE-ROUTE-MODE-002: returns true when trip default is waterway', () => {
    const assignments = [
      buildAssignment({ order_index: 0 }),
      buildAssignment({ order_index: 1 }),
      buildAssignment({ order_index: 2 }),
    ];
    expect(dayHasWaterwayLegsBeforeLast(assignments, 'waterway')).toBe(true);
  });

  it('FE-ROUTE-MODE-003: returns true when a non-final leg overrides to waterway', () => {
    const assignments = [
      buildAssignment({ order_index: 0, route_mode_override: 'waterway' as const }),
      buildAssignment({ order_index: 1 }),
      buildAssignment({ order_index: 2 }),
    ];
    expect(dayHasWaterwayLegsBeforeLast(assignments, 'walking')).toBe(true);
  });

  it('FE-ROUTE-MODE-004: ignores waterway override on the last stop only', () => {
    const assignments = [
      buildAssignment({ order_index: 0 }),
      buildAssignment({ order_index: 1 }),
      buildAssignment({ order_index: 2, route_mode_override: 'waterway' as const }),
    ];
    expect(dayHasWaterwayLegsBeforeLast(assignments, 'walking')).toBe(false);
  });
});
