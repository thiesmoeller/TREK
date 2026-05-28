import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  prepareMock,
  routeWaterwayLegMock,
  osrmLegRouteMock,
  fetchOverpassInterpreterMock,
  tripRow,
} = vi.hoisted(() => ({
  prepareMock: vi.fn(),
  routeWaterwayLegMock: vi.fn(),
  osrmLegRouteMock: vi.fn(),
  fetchOverpassInterpreterMock: vi.fn(),
  tripRow: {
    id: 1,
    is_rowing_trip: 1,
    default_route_leg_kind: 'waterway',
    rowing_speed_kmh: 6,
    rowing_lock_delay_min: null as number | null,
  },
}));

vi.mock('../../../src/db/database', () => ({
  db: {
    prepare: prepareMock,
  },
}));

vi.mock('../../../src/services/reservationService', () => ({
  listReservations: vi.fn(() => []),
}));

vi.mock('../../../src/services/assignmentService', () => ({
  listDayAssignments: vi.fn(() => [
    {
      id: 101,
      order_index: 1,
      route_leg_override: null,
      place: { lat: 52.5448, lng: 11.9769 },
    },
    {
      id: 102,
      order_index: 2,
      route_leg_override: null,
      place: { lat: 52.83264, lng: 12.07639 },
    },
  ]),
}));

vi.mock('../../../src/services/routing/waterwayRouting', () => ({
  routeWaterwayLeg: routeWaterwayLegMock,
}));

vi.mock('../../../src/services/routing/osrmRouting', () => ({
  osrmLegRoute: osrmLegRouteMock,
}));

vi.mock('../../../src/services/mapsService', () => ({
  fetchOverpassInterpreter: fetchOverpassInterpreterMock,
}));

import { computeMixedDayRoute } from '../../../src/services/mixedDayRouteService';

describe('computeMixedDayRoute waterway context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    tripRow.is_rowing_trip = 1;
    tripRow.default_route_leg_kind = 'waterway';
    tripRow.rowing_speed_kmh = 6;
    tripRow.rowing_lock_delay_min = 15;
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('provider unavailable in unit test');
    }));

    prepareMock.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id, is_rowing_trip, default_route_leg_kind')) {
        return { get: () => ({ ...tripRow }) };
      }
      if (sql.includes('SELECT id FROM days WHERE id = ? AND trip_id = ?')) {
        return { get: () => ({ id: 10 }) };
      }
      if (sql.includes('SELECT id, day_number, date FROM days WHERE trip_id = ? ORDER BY day_number ASC')) {
        return { all: () => [{ id: 10, day_number: 1, date: '2026-05-14' }] };
      }
      throw new Error(`Unexpected SQL in mixed route test: ${sql}`);
    });

    const tangermuendeToHavelberg: [number, number][] = [
      [52.5448, 11.9769],
      [52.6264, 11.9457],
      [52.7047, 11.9831],
      [52.7897, 12.0451],
      [52.8323, 12.05548],
      [52.83264, 12.07639],
    ];

    routeWaterwayLegMock.mockResolvedValue({
      coords: tangermuendeToHavelberg,
      distanceM: 36_000,
    });
    osrmLegRouteMock.mockResolvedValue({
      coords: [[52.5448, 11.9769], [52.83264, 12.07639]],
      distanceM: 42_000,
      durationS: 3_600,
    });
    fetchOverpassInterpreterMock.mockResolvedValue({
      elements: [
        {
          type: 'node',
          id: 494,
          lat: 52.8323,
          lon: 12.05548,
          tags: {
            lock: 'yes',
            waterway: 'lock_gate',
            name: 'Schleuse Havelberg',
            vhf: '21',
          },
        },
      ],
    });
  });

  it('plans Tangermunde to Havelberg as a waterway leg with the Havelberg lock annotation', async () => {
    const result = await computeMixedDayRoute(1, 10);

    expect(result.segments).toHaveLength(1);
    expect(result.legs).toHaveLength(1);

    const leg = result.legs[0];
    expect(leg.kind).toBe('waterway');
    expect(leg.waterwayContext?.locks).toHaveLength(1);
    expect(leg.waterwayContext?.locks[0]).toMatchObject({
      name: 'Schleuse Havelberg',
      lat: 52.8323,
      lng: 12.05548,
      delayS: 15 * 60,
    });
    expect(leg.waterwayContext?.lockDelayS).toBe(15 * 60);
    expect(leg.waterwayContext?.adjustedRowingDurationS).toBeGreaterThan(leg.waterwayContext!.baseRowingDurationS);
    expect(leg.rowingText).toContain('+15 min locks');
    expect(leg.durationS).toBeGreaterThan(0);
    expect(leg.lockCount).toBe(1);
    expect(leg.isFallback).toBe(false);
  });

  it('uses TREK_LOCK_DELAY_MIN when trip rowing_lock_delay_min is unset', async () => {
    vi.stubEnv('TREK_LOCK_DELAY_MIN', '20');
    tripRow.rowing_lock_delay_min = null;

    const result = await computeMixedDayRoute(1, 10);
    const leg = result.legs[0];
    expect(leg.waterwayContext?.locks[0]?.delayS).toBe(20 * 60);
    expect(leg.lockDelayS).toBe(20 * 60);
    vi.unstubAllEnvs();
  });

  it('routes a walking leg via OSRM without calling waterway routing', async () => {
    tripRow.default_route_leg_kind = 'walking';
    tripRow.rowing_lock_delay_min = 15;

    const result = await computeMixedDayRoute(1, 10);

    expect(routeWaterwayLegMock).not.toHaveBeenCalled();
    expect(osrmLegRouteMock).toHaveBeenCalled();
    expect(result.legs[0].kind).toBe('walking');
    expect(result.legs[0].rowingText).toBeNull();
    expect(result.legs[0].isFallback).toBe(false);
    expect(result.legs[0].durationS).toBe(3600);
  });

  it('marks straight-line waterway failures as fallback without lock context', async () => {
    tripRow.default_route_leg_kind = 'waterway';
    routeWaterwayLegMock.mockRejectedValue(new Error('no_waterway_graph'));

    const result = await computeMixedDayRoute(1, 10);
    const leg = result.legs[0];

    expect(leg.kind).toBe('waterway');
    expect(leg.isFallback).toBe(true);
    expect(leg.lockCount).toBe(0);
    expect(leg.waterwayContext?.locks).toEqual([]);
    expect(leg.rowingText).toContain('fallback');
  });
});
