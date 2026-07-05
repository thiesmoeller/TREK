/**
 * Day route endpoint integration tests with mocked OSRM.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import type { INestApplication } from '@nestjs/common';

const { osrmLegRoute } = vi.hoisted(() => ({
  osrmLegRoute: vi.fn(),
}));

vi.mock('../../src/services/routing/osrmRouting', () => ({ osrmLegRoute }));

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
    canAccessTrip: (tripId: any, userId: number) =>
      db.prepare(`SELECT t.id, t.user_id FROM trips t LEFT JOIN trip_members m ON m.trip_id = t.id AND m.user_id = ? WHERE t.id = ? AND (t.user_id = ? OR m.user_id IS NOT NULL)`).get(userId, tripId, userId),
    isOwner: (tripId: any, userId: number) =>
      !!db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId),
  };
  return { testDb: db, dbMock: mock };
});

vi.mock('../../src/db/database', () => dbMock);
vi.mock('../../src/config', () => ({
  JWT_SECRET: 'test-jwt-secret-for-trek-testing-only',
  ENCRYPTION_KEY: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2',
  updateJwtSecret: () => {},
  SESSION_DURATION: '24h',
  SESSION_DURATION_MS: 86400000,
  SESSION_DURATION_SECONDS: 86400,
  DEFAULT_LANGUAGE: 'en',
}));
vi.mock('../../src/websocket', () => ({ broadcast: vi.fn(), broadcastToUser: vi.fn() }));

import { buildApp } from '../../src/bootstrap';
import { createTables } from '../../src/db/schema';
import { runMigrations } from '../../src/db/migrations';
import { resetTestDb, resetRateLimits } from '../helpers/test-db';
import { createUser, createTrip, createPlace, createDayAssignment } from '../helpers/factories';
import { authCookie } from '../helpers/auth';

let nestApp: INestApplication;
let app: Application;

function getFirstDayId(tripId: number): number {
  const day = testDb.prepare('SELECT id FROM days WHERE trip_id = ? ORDER BY day_number ASC LIMIT 1').get(tripId) as { id: number };
  return day.id;
}

beforeAll(async () => {
  createTables(testDb);
  runMigrations(testDb);
  nestApp = await buildApp();
  app = nestApp.getHttpAdapter().getInstance();
});

beforeEach(() => {
  resetTestDb(testDb);
  resetRateLimits(nestApp);
  vi.clearAllMocks();
});

afterAll(async () => {
  await nestApp.close();
  testDb.close();
});

describe('GET /api/trips/:tripId/days/:dayId/route', () => {
  it('DAY-ROUTE-001 — returns OSRM geometry for a walking day with two stops', async () => {
    osrmLegRoute.mockResolvedValueOnce({
      coords: [[52.52, 13.405], [52.525, 13.412], [52.53, 13.42]],
      distanceM: 1800,
      durationS: 1200,
    });

    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-08-01', end_date: '2026-08-02' });
    const dayId = getFirstDayId(trip.id);
    const p1 = createPlace(testDb, trip.id, { name: 'Start', lat: 52.52, lng: 13.405 });
    const p2 = createPlace(testDb, trip.id, { name: 'End', lat: 52.53, lng: 13.42 });
    createDayAssignment(testDb, dayId, p1.id, { order_index: 0 });
    createDayAssignment(testDb, dayId, p2.id, { order_index: 1 });

    const res = await request(app)
      .get(`/api/trips/${trip.id}/days/${dayId}/route`)
      .set('Cookie', authCookie(user.id));

    expect(res.status).toBe(200);
    expect(osrmLegRoute).toHaveBeenCalledTimes(1);
    expect(res.body.segments).toHaveLength(1);
    expect(res.body.legs).toHaveLength(1);
    expect(res.body.legs[0]).toMatchObject({
      routeMode: 'walking',
      distanceM: 1800,
      durationS: 1200,
      isApproximate: false,
    });
  });

  it('DAY-ROUTE-002 — 404 when day does not belong to trip', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-08-01', end_date: '2026-08-02' });

    const res = await request(app)
      .get(`/api/trips/${trip.id}/days/99999/route`)
      .set('Cookie', authCookie(user.id));

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Day not found');
  });

  it('DAY-ROUTE-003 — unregistered plugin mode falls back to approximate legs', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-08-01', end_date: '2026-08-02' });
    testDb.prepare("UPDATE trips SET default_route_mode = ? WHERE id = ?").run('waterway', trip.id);
    const dayId = getFirstDayId(trip.id);
    const p1 = createPlace(testDb, trip.id, { name: 'Start', lat: 52.52, lng: 13.405 });
    const p2 = createPlace(testDb, trip.id, { name: 'End', lat: 52.53, lng: 13.42 });
    createDayAssignment(testDb, dayId, p1.id, { order_index: 0 });
    createDayAssignment(testDb, dayId, p2.id, { order_index: 1 });

    const res = await request(app)
      .get(`/api/trips/${trip.id}/days/${dayId}/route`)
      .set('Cookie', authCookie(user.id));

    expect(res.status).toBe(200);
    expect(osrmLegRoute).not.toHaveBeenCalled();
    expect(res.body.legs[0]).toMatchObject({
      routeMode: 'waterway',
      isApproximate: true,
    });
  });
});
