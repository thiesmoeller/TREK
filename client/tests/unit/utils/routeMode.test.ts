import { describe, it, expect } from 'vitest';
import { buildAssignment, buildPlace } from '../../helpers/factories';
import {
  dayHasWaterwayLegsBeforeLast,
  dayHasNonOptimizableLegsBeforeLast,
  routeModeLabel,
} from '../../../src/utils/routeMode';

const MODES = [
  { mode: 'walking', label: 'Walk', labelKey: 'routeMode.walking', allowsOptimize: true },
  { mode: 'driving', label: 'Drive', labelKey: 'routeMode.driving', allowsOptimize: true },
  { mode: 'waterway', label: 'Waterway', allowsOptimize: false },
];

const t = (key: string) => (key === 'routeMode.walking' ? 'Walk' : key);

describe('routeModeLabel', () => {
  it('uses labelKey for built-in modes', () => {
    expect(routeModeLabel(MODES[0], t)).toBe('Walk');
  });

  it('falls back to manifest label for plugin modes', () => {
    expect(routeModeLabel(MODES[2], t)).toBe('Waterway');
  });
});

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
      buildAssignment({ order_index: 0, route_mode_override: 'waterway' }),
      buildAssignment({ order_index: 1 }),
      buildAssignment({ order_index: 2 }),
    ];
    expect(dayHasWaterwayLegsBeforeLast(assignments, 'walking')).toBe(true);
  });

  it('FE-ROUTE-MODE-004: ignores waterway override on the last stop only', () => {
    const assignments = [
      buildAssignment({ order_index: 0 }),
      buildAssignment({ order_index: 1 }),
      buildAssignment({ order_index: 2, route_mode_override: 'waterway' }),
    ];
    expect(dayHasWaterwayLegsBeforeLast(assignments, 'walking')).toBe(false);
  });
});

describe('dayHasNonOptimizableLegsBeforeLast', () => {
  it('returns false when all legs allow optimize', () => {
    const assignments = [
      buildAssignment({ order_index: 0 }),
      buildAssignment({ order_index: 1 }),
      buildAssignment({ order_index: 2 }),
    ];
    expect(dayHasNonOptimizableLegsBeforeLast(assignments, 'walking', MODES)).toBe(false);
  });

  it('returns true when trip default mode disallows optimize', () => {
    const assignments = [
      buildAssignment({ order_index: 0 }),
      buildAssignment({ order_index: 1 }),
      buildAssignment({ order_index: 2 }),
    ];
    expect(dayHasNonOptimizableLegsBeforeLast(assignments, 'waterway', MODES)).toBe(true);
  });
});
