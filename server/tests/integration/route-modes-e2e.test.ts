/**
 * Route modes E2E — discovery API and plugin stub registration (issue route-modes-08).
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import type { INestApplication } from '@nestjs/common';

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
import { createUser } from '../helpers/factories';
import { authCookie } from '../helpers/auth';
import { RouteProviderRegistryService } from '../../src/nest/plugins/route-provider-registry.service';

let nestApp: INestApplication;
let app: Application;

beforeAll(async () => {
  createTables(testDb);
  runMigrations(testDb);
  nestApp = await buildApp();
  app = nestApp.getHttpAdapter().getInstance();
});

beforeEach(() => {
  resetTestDb(testDb);
  resetRateLimits(nestApp);
});

afterAll(async () => {
  await nestApp.close();
  testDb.close();
});

describe('Route modes API (ROUTE-MODES-E2E)', () => {
  it('ROUTE-MODES-E2E-001 — lists built-in walking and driving modes', async () => {
    const { user } = createUser(testDb);
    const res = await request(app)
      .get('/api/route-modes')
      .set('Cookie', authCookie(user.id))
      .expect(200);

    const modes = res.body.modes as Array<{ mode: string; allowsOptimize: boolean }>;
    expect(modes.map((m) => m.mode).sort()).toEqual(['driving', 'walking']);
    expect(modes.every((m) => m.allowsOptimize)).toBe(true);
  });

  it('ROUTE-MODES-E2E-002 — includes active plugin modes from the registry', async () => {
    const registry = nestApp.get(RouteProviderRegistryService);
    registry.register('test-waterway', [{
      mode: 'waterway',
      label: 'Waterway',
      allowsOptimize: false,
      options: [{ key: 'speedKmh', type: 'number', label: 'Speed (km/h)', min: 1, max: 30, default: 6 }],
    }]);

    const { user } = createUser(testDb);
    const res = await request(app)
      .get('/api/route-modes')
      .set('Cookie', authCookie(user.id))
      .expect(200);

    const waterway = (res.body.modes as Array<{ mode: string }>).find((m) => m.mode === 'waterway');
    expect(waterway).toMatchObject({
      mode: 'waterway',
      label: 'Waterway',
      allowsOptimize: false,
    });
    expect(waterway?.options?.[0]?.key).toBe('speedKmh');

    registry.unregister('test-waterway');
  });

  it('ROUTE-MODES-E2E-003 — rejects unregistered plugin mode on trip update', async () => {
    const { user } = createUser(testDb);
    const tripRes = await request(app)
      .post('/api/trips')
      .set('Cookie', authCookie(user.id))
      .send({ title: 'Route test', start_date: '2026-08-01', end_date: '2026-08-02' })
      .expect(201);

    const tripId = tripRes.body.trip.id;
    await request(app)
      .put(`/api/trips/${tripId}`)
      .set('Cookie', authCookie(user.id))
      .send({ default_route_mode: 'waterway' })
      .expect(400);
  });
});
