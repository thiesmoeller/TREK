import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prepareMock, osrmLegRouteMock } = vi.hoisted(() => ({
  prepareMock: vi.fn(),
  osrmLegRouteMock: vi.fn(),
}));

vi.mock('../../../src/db/database', () => ({
  db: { prepare: prepareMock },
}));

vi.mock('../../../src/services/routing/osrmRouting', () => ({
  osrmLegRoute: osrmLegRouteMock,
}));

import { computeGearShuttleRoutes } from '../../../src/services/gearShuttleRouteService';

describe('computeGearShuttleRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty segments when fewer than two geocoded accommodations', async () => {
    prepareMock.mockImplementation(() => ({
      all: () => [
        { acc_id: 1, start_day_id: 1, place_id: 10, place_lat: 52.5, place_lng: 13.4, place_name: 'Hotel A' },
        { acc_id: 2, start_day_id: 2, place_id: 11, place_lat: null, place_lng: null, place_name: 'Camp B' },
      ],
    }));

    const result = await computeGearShuttleRoutes(1);
    expect(result).toEqual({ segments: [], legs: [] });
    expect(osrmLegRouteMock).not.toHaveBeenCalled();
  });

  it('builds driving legs between consecutive geocoded accommodations', async () => {
    prepareMock.mockImplementation(() => ({
      all: () => [
        { acc_id: 1, start_day_id: 1, place_id: 10, place_lat: 52.5, place_lng: 13.4, place_name: 'Hotel A' },
        { acc_id: 2, start_day_id: 2, place_id: 11, place_lat: 52.6, place_lng: 13.5, place_name: 'Hotel B' },
        { acc_id: 3, start_day_id: 3, place_id: 12, place_lat: 52.7, place_lng: 13.6, place_name: 'Hotel C' },
      ],
    }));

    osrmLegRouteMock
      .mockResolvedValueOnce({
        coords: [[52.5, 13.4], [52.55, 13.45], [52.6, 13.5]],
        distanceM: 12_000,
        durationS: 900,
      })
      .mockResolvedValueOnce({
        coords: [[52.6, 13.5], [52.7, 13.6]],
        distanceM: 8_000,
        durationS: 600,
      });

    const result = await computeGearShuttleRoutes(42);
    expect(osrmLegRouteMock).toHaveBeenCalledTimes(2);
    if ('error' in result) throw new Error('unexpected error');

    expect(result.segments).toHaveLength(2);
    expect(result.legs).toHaveLength(2);
    expect(result.legs[0]).toMatchObject({
      polylineIndex: 0,
      distanceM: 12_000,
      durationS: 900,
    });
    expect(result.legs[1]).toMatchObject({
      polylineIndex: 1,
      distanceM: 8_000,
      durationS: 600,
    });
    expect(result.legs[0].distanceText).toContain('km');
  });

  it('falls back to straight line when OSRM fails', async () => {
    prepareMock.mockImplementation(() => ({
      all: () => [
        { acc_id: 1, start_day_id: 1, place_id: 10, place_lat: 52.5, place_lng: 13.4, place_name: 'A' },
        { acc_id: 2, start_day_id: 2, place_id: 11, place_lat: 52.6, place_lng: 13.5, place_name: 'B' },
      ],
    }));

    osrmLegRouteMock.mockRejectedValue(new Error('osrm_down'));

    const result = await computeGearShuttleRoutes(7);
    if ('error' in result) throw new Error('unexpected error');

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toEqual([[52.5, 13.4], [52.6, 13.5]]);
    expect(result.legs[0].distanceM).toBeGreaterThan(0);
    expect(result.legs[0].durationS).toBeGreaterThan(0);
  });
});
