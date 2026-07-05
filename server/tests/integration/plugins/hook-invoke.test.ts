/**
 * Host→child hook invoke (#plugins, route-modes-03): routeProvider.routeLeg over
 * the supervisor channel, with cancel on upstream abort.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { testDb } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE plugins (
    id TEXT PRIMARY KEY, status TEXT, enabled INTEGER DEFAULT 0, permissions TEXT DEFAULT '[]', granted_permissions TEXT DEFAULT '',
    config TEXT DEFAULT '{}', capabilities TEXT DEFAULT '{}', last_error TEXT, updated_at TEXT);
    CREATE TABLE plugin_error_log (id INTEGER PRIMARY KEY AUTOINCREMENT, plugin_id TEXT, level TEXT, message TEXT, ts TEXT);
    CREATE TABLE plugin_settings_fields (plugin_id TEXT, field_key TEXT, scope TEXT, secret INTEGER);
    CREATE TABLE settings (user_id INTEGER, key TEXT, value TEXT);`);
  return { testDb: db };
});
vi.mock('../../../src/db/database', () => ({ db: testDb, canAccessTrip: () => undefined }));
vi.mock('../../../src/websocket', () => ({ broadcast: vi.fn(), broadcastToUser: vi.fn() }));

import { PluginRuntimeService } from '../../../src/nest/plugins/plugin-runtime.service';

const FIXTURE = path.join(__dirname, '../../fixtures/plugins/route-provider-stub');
const PLUGIN_ID = 'route-provider-stub';

let codeRoot: string;
let dataRoot: string;
let runtime: PluginRuntimeService;

function copyFixture(id: string, slowSource?: string): void {
  const dest = path.join(codeRoot, id);
  fs.cpSync(FIXTURE, dest, { recursive: true });
  if (slowSource) {
    fs.writeFileSync(path.join(dest, 'server', 'index.js'), slowSource);
  }
}

const legReq = {
  mode: 'stub',
  from: { lat: 52.0, lng: 5.0 },
  to: { lat: 52.1, lng: 5.1 },
  legKey: 'a-b',
  tripId: 1,
};

beforeAll(() => {
  codeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trekplug-hook-code-'));
  dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trekplug-hook-data-'));
  process.env.TREK_PLUGINS_DIR = codeRoot;
  process.env.TREK_PLUGINS_DATA_DIR = dataRoot;
  process.env.TREK_PLUGINS_ENABLED = 'true';

  copyFixture(PLUGIN_ID);
  testDb
    .prepare("INSERT INTO plugins (id, status, permissions, granted_permissions, config, capabilities) VALUES (?, 'inactive', ?, ?, '{}', ?)")
    .run(
      PLUGIN_ID,
      JSON.stringify(['hook:route-provider']),
      JSON.stringify(['hook:route-provider']),
      JSON.stringify({ routeModes: [{ mode: 'stub', label: 'Stub', allowsOptimize: false }] }),
    );

  runtime = new PluginRuntimeService();
});

afterAll(async () => {
  await runtime?.deactivate(PLUGIN_ID).catch(() => {});
  delete process.env.TREK_PLUGINS_DIR;
  delete process.env.TREK_PLUGINS_DATA_DIR;
  delete process.env.TREK_PLUGINS_ENABLED;
  delete process.env.TREK_STUB_SLOW_MS;
  fs.rmSync(codeRoot, { recursive: true, force: true });
  fs.rmSync(dataRoot, { recursive: true, force: true });
});

describe('hook invoke (routeProvider)', () => {
  it('activates the stub plugin and invokes routeLeg with deterministic geometry', async () => {
    await runtime.activate(PLUGIN_ID);
    expect(runtime.isActive(PLUGIN_ID)).toBe(true);
    expect(runtime.hooksOf(PLUGIN_ID)).toEqual({ routeProvider: true });

    const modes = (await runtime.invokeHook(PLUGIN_ID, 'routeProvider', 'modes', [])) as string[];
    expect(modes).toEqual(['stub']);

    const result = (await runtime.invokeHook(PLUGIN_ID, 'routeProvider', 'routeLeg', [legReq])) as {
      coords: [number, number][];
      distanceM: number;
      durationS: number;
    };
    expect(result.distanceM).toBe(1000);
    expect(result.durationS).toBe(120);
    expect(result.coords).toEqual([
      [52.0, 5.0],
      [52.05, 5.05],
      [52.1, 5.1],
    ]);
  });

  it('cancels a slow in-flight hook invoke without late resolution', async () => {
    const slowPlugin = path.join(codeRoot, 'slow-stub');
    fs.cpSync(FIXTURE, slowPlugin, { recursive: true });
    fs.writeFileSync(
      path.join(slowPlugin, 'server', 'index.js'),
      `const { definePlugin } = require('trek-plugin-sdk');
      module.exports = definePlugin({
        hooks: {
          routeProvider: {
            modes() { return ['stub']; },
            routeLeg(req) {
              const ms = Number(process.env.TREK_STUB_SLOW_MS) || 5000;
              return new Promise((resolve) => {
                setTimeout(() => resolve({
                  coords: [[req.from.lat, req.from.lng], [req.to.lat, req.to.lng]],
                  distanceM: 999,
                }), ms);
              });
            },
          },
        },
      });`,
    );
    testDb
      .prepare("INSERT INTO plugins (id, status, permissions, granted_permissions, config, capabilities) VALUES ('slow-stub','inactive',?,?,'{}',?)")
      .run(
        JSON.stringify(['hook:route-provider']),
        JSON.stringify(['hook:route-provider']),
        JSON.stringify({ routeModes: [{ mode: 'stub', label: 'Stub', allowsOptimize: false }] }),
      );

    process.env.TREK_STUB_SLOW_MS = '5000';
    await runtime.activate('slow-stub');

    const ac = new AbortController();
    const late: unknown[] = [];
    const p = runtime.invokeHook('slow-stub', 'routeProvider', 'routeLeg', [legReq], { signal: ac.signal });
    p.then((v) => late.push(v)).catch(() => {});

    await new Promise((r) => setTimeout(r, 50));
    ac.abort();

    await expect(p).rejects.toThrow(/cancelled/);
    await new Promise((r) => setTimeout(r, 200));
    expect(late).toEqual([]);

    await runtime.deactivate('slow-stub');
  });

  it('fails when the plugin is inactive', async () => {
    await runtime.deactivate(PLUGIN_ID);
    await expect(
      Promise.resolve().then(() => runtime.invokeHook(PLUGIN_ID, 'routeProvider', 'routeLeg', [legReq])),
    ).rejects.toThrow(/not active/);
  });

  it('fails when the plugin lacks hook:route-provider permission', async () => {
    copyFixture('no-hook');
    testDb
      .prepare("INSERT INTO plugins (id, status, permissions, granted_permissions, config, capabilities) VALUES ('no-hook','inactive','[]','[]','{}','{}')")
      .run();
    await runtime.activate('no-hook');
    await expect(
      Promise.resolve().then(() => runtime.invokeHook('no-hook', 'routeProvider', 'routeLeg', [legReq])),
    ).rejects.toThrow(/hook:route-provider/);
    await runtime.deactivate('no-hook');
  });
});
