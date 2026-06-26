/**
 * Mixed day route service — walking/waterway legs and approximate fallback.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';

const { osrmLegRoute, routeWaterwayLeg } = vi.hoisted(() => ({
  osrmLegRoute: vi.fn(),
  routeWaterwayLeg: vi.fn(),
}));

vi.mock('../../../src/services/routing/osrmRouting', () => ({ osrmLegRoute }));
vi.mock('../../../src/services/routing/waterwayRouting', () => ({ routeWaterwayLeg }));

const { testDb, dbMock } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  const mock = {
    db,
    closeDb: () => {},
    reinitialize: () => {},
    getPlaceWithTags: () => null,
    canAccessTrip: () => null,
    isOwner: () => false,
  };
  return { testDb: db, dbMock: mock };
});

vi.mock('../../../src/db/database', () => dbMock);
vi.mock('../../../src/config', () => ({
  JWT_SECRET: 'test-secret',
  ENCRYPTION_KEY: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2',
  updateJwtSecret: () => {},
}));

import { createTables } from '../../../src/db/schema';
import { runMigrations } from '../../../src/db/migrations';
import { resetTestDb } from '../../helpers/test-db';
import { createUser, createTrip, createPlace, createDayAssignment } from '../../helpers/factories';
import { computeMixedDayRoute } from '../../../src/services/mixedDayRouteService';

function getFirstDayId(tripId: number): number {
  const day = testDb.prepare('SELECT id FROM days WHERE trip_id = ? ORDER BY day_number ASC LIMIT 1').get(tripId) as { id: number };
  return day.id;
}

function seedTwoStopDay(tripId: number, dayId: number) {
  const p1 = createPlace(testDb, tripId, { name: 'Start', lat: 52.52, lng: 13.405 });
  const p2 = createPlace(testDb, tripId, { name: 'End', lat: 52.53, lng: 13.42 });
  createDayAssignment(testDb, dayId, p1.id, { order_index: 0 });
  createDayAssignment(testDb, dayId, p2.id, { order_index: 1 });
}

beforeAll(() => {
  createTables(testDb);
  runMigrations(testDb);
});

beforeEach(() => {
  resetTestDb(testDb);
  vi.clearAllMocks();
});

afterAll(() => {
  testDb.close();
});

describe('computeMixedDayRoute', () => {
  it('MIXED-ROUTE-001: walking trip default uses OSRM and returns structured legs', async () => {
    osrmLegRoute.mockResolvedValueOnce({
      coords: [[52.52, 13.405], [52.525, 13.412], [52.53, 13.42]],
      distanceM: 1800,
      durationS: 1200,
    });

    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-08-01', end_date: '2026-08-02' });
    const dayId = getFirstDayId(trip.id);
    seedTwoStopDay(trip.id, dayId);

    const result = await computeMixedDayRoute(trip.id, dayId);

    expect(osrmLegRoute).toHaveBeenCalledTimes(1);
    expect(routeWaterwayLeg).not.toHaveBeenCalled();
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].length).toBeGreaterThanOrEqual(2);
    expect(result.legs).toHaveLength(1);
    expect(result.legs[0]).toMatchObject({
      routeMode: 'walking',
      distanceM: 1800,
      durationS: 1200,
      isApproximate: false,
      polylineIndex: 0,
    });
    expect(result.legs[0]).not.toHaveProperty('walkingText');
  });

  it('MIXED-ROUTE-002: waterway trip default routes via waterway adapter', async () => {
    routeWaterwayLeg.mockResolvedValueOnce({
      coords: [[52.52, 13.405], [52.53, 13.42]],
      distanceM: 9500,
    });

    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-08-01', end_date: '2026-08-02' });
    testDb.prepare('UPDATE trips SET default_route_mode = ?, waterway_speed_kmh = ? WHERE id = ?').run('waterway', 6, trip.id);
    const dayId = getFirstDayId(trip.id);
    seedTwoStopDay(trip.id, dayId);

    const result = await computeMixedDayRoute(trip.id, dayId);

    expect(routeWaterwayLeg).toHaveBeenCalledTimes(1);
    expect(osrmLegRoute).not.toHaveBeenCalled();
    expect(result.legs[0]).toMatchObject({
      routeMode: 'waterway',
      distanceM: 9500,
      isApproximate: false,
    });
    expect(result.legs[0].durationS).toBeGreaterThan(0);
  });

  it('MIXED-ROUTE-003: failed waterway leg falls back to approximate straight segment', async () => {
    routeWaterwayLeg.mockRejectedValueOnce(new Error('no graph path'));

    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-08-01', end_date: '2026-08-02' });
    testDb.prepare('UPDATE trips SET default_route_mode = ? WHERE id = ?').run('waterway', trip.id);
    const dayId = getFirstDayId(trip.id);
    seedTwoStopDay(trip.id, dayId);

    const result = await computeMixedDayRoute(trip.id, dayId);

    expect(result.legs).toHaveLength(1);
    expect(result.legs[0]).toMatchObject({
      routeMode: 'waterway',
      isApproximate: true,
    });
    expect(result.legs[0].distanceM).toBeGreaterThan(0);
    expect(result.segments[0]).toEqual([
      [52.52, 13.405],
      [52.53, 13.42],
    ]);
  });

  it('MIXED-ROUTE-003b: cancellation is not converted into an approximate fallback', async () => {
    routeWaterwayLeg.mockRejectedValueOnce(new Error('route_timeout'));

    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-08-01', end_date: '2026-08-02' });
    testDb.prepare('UPDATE trips SET default_route_mode = ? WHERE id = ?').run('waterway', trip.id);
    const dayId = getFirstDayId(trip.id);
    seedTwoStopDay(trip.id, dayId);

    await expect(computeMixedDayRoute(trip.id, dayId)).rejects.toThrow('route_timeout');
  });

  it('MIXED-ROUTE-004: throws trip_not_found and day_not_found', async () => {
    await expect(computeMixedDayRoute(99999, 1)).rejects.toThrow('trip_not_found');

    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-08-01', end_date: '2026-08-02' });
    await expect(computeMixedDayRoute(trip.id, 99999)).rejects.toThrow('day_not_found');
  });
});
