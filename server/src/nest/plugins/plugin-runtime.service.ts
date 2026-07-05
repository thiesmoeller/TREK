import { Injectable, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { db } from '../../db/database';
import { pluginsEnabled } from './kill-switch';
import { decrypt_api_key } from '../../services/apiKeyCrypto';
import { PluginSupervisor, type PluginRouteInfo } from './supervisor/plugin-supervisor';
import fs from 'node:fs';
import { createRealRpcHost, closePluginDataDb } from './host/create-rpc-host';
import { removePluginData } from './host/plugin-data.service';
import { isKnownPermission } from './protocol/envelope';
import { discoverPlugins } from './install/discovery';
import { parseStoredCapabilities } from './install/manifest';
import { pluginCodeDir } from './paths';
import { PluginRegistryService } from './registry/registry.service';
import { RouteProviderRegistryService } from './route-provider-registry.service';

const HTTP_OUTBOUND = 'http:outbound:';

/** Thrown when (re-)activating would grant permissions the admin hasn't consented to. */
export class PluginConsentRequired extends Error {
  constructor(message: string, readonly newPermissions: string[] = [], readonly newEgress: string[] = []) {
    super(message);
  }
}

/**
 * Owns the isolated-plugin runtime lifecycle inside NestJS (#plugins, M2).
 * Bridges the DB registry (`plugins` rows) to the process supervisor: activate
 * spawns the child with its granted permissions + decrypted instance config,
 * deactivate kills it, and status/errors are persisted back to the DB. Boots all
 * `active` plugins on startup when the runtime is enabled.
 */

interface PluginRow {
  id: string;
  status: string;
  permissions: string;
  granted_permissions: string;
  config: string;
  capabilities: string;
}

@Injectable()
export class PluginRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly supervisor = new PluginSupervisor(createRealRpcHost, {
    onStatus: (id, status, error) => {
      db.prepare('UPDATE plugins SET status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        status,
        error ?? null,
        id,
      );
    },
    onLog: (id, level, msg) => {
      if (level === 'error' || level === 'warn') {
        db.prepare('INSERT INTO plugin_error_log (plugin_id, level, message) VALUES (?, ?, ?)').run(id, level, msg);
      }
    },
  });

  // Nest always injects the real registry; tests may omit it.
  constructor(
    private readonly registry?: PluginRegistryService,
    private readonly routeProviders?: RouteProviderRegistryService,
  ) {}

  onModuleInit(): void {
    if (!pluginsEnabled()) return;
    // Discover plugins placed on the volume (registers new ones inactive), then
    // boot the ones an admin had already activated.
    try {
      discoverPlugins(db);
    } catch {
      /* discovery must never block boot */
    }
    // Boot everything the admin left ENABLED, regardless of the last runtime
    // status — a crash or a bad deploy set status='error' but must not silently
    // keep the plugin down forever.
    const enabled = db.prepare('SELECT id FROM plugins WHERE enabled = 1').all() as Array<{ id: string }>;
    for (const { id } of enabled) {
      this.activate(id).catch(() => {
        /* status is persisted as error by the supervisor hook */
      });
    }
  }

  /** Re-scan the plugins volume on demand (admin action). */
  rescan(): { discovered: string[]; skipped: string[] } {
    return discoverPlugins(db);
  }

  async onModuleDestroy(): Promise<void> {
    await this.supervisor.shutdownAll();
  }

  /**
   * Spawn a plugin from its DB row (granted permissions + decrypted config).
   *
   * A plain activate may NEVER widen what the admin already consented to — that is
   * what stops a plugin left off pending an update's re-consent from silently
   * gaining the new rights via the row's enable toggle. The FIRST activation of a
   * freshly-installed plugin (no prior grant) is itself the consent for its
   * declared set; widening an already-consented set requires `consentWiden` (the
   * update consent dialog), and otherwise throws PluginConsentRequired.
   */
  async activate(id: string, consentWiden = false): Promise<void> {
    const row = db.prepare('SELECT id, status, permissions, granted_permissions, config, capabilities FROM plugins WHERE id = ?').get(id) as
      | PluginRow
      | undefined;
    if (!row) throw new Error(`plugin ${id} not found`);

    const declared = parseArray(row.permissions).filter(isKnownPermission);
    const granted = parseArray(row.granted_permissions);
    const newGrants = declared.filter((p) => !granted.includes(p));
    // "Ever consented" is a non-empty granted_permissions string (even '[]' — the
    // consent to zero perms). Only the very first activation (marker '') may grant
    // the declared set without an explicit consent; any later widening needs one.
    const everConsented = !!row.granted_permissions;
    if (everConsented && newGrants.length > 0 && !consentWiden) {
      const newEgress = newGrants.filter((p) => p.startsWith(HTTP_OUTBOUND)).map((p) => p.slice(HTTP_OUTBOUND.length)).filter(Boolean);
      const newPermissions = newGrants.filter((p) => !p.startsWith(HTTP_OUTBOUND));
      throw new PluginConsentRequired(`plugin ${id} requests new permissions; explicit re-consent is required`, newPermissions, newEgress);
    }
    // Mark it enabled (admin intent) so it reboots after restarts/crashes.
    db.prepare('UPDATE plugins SET granted_permissions = ?, enabled = 1 WHERE id = ?').run(JSON.stringify(declared), id);
    const config = decryptConfig(parseObject(row.config));
    const egress = declared.filter((p) => p.startsWith('http:outbound:')).map((p) => p.slice('http:outbound:'.length));
    const routeModes = parseStoredCapabilities(row.capabilities).routeModes ?? [];
    try {
      if (routeModes.length) this.routeProviders?.register(id, routeModes);
      await this.supervisor.activate(id, new Set(declared), config, egress);
    } catch (e) {
      this.routeProviders?.unregister(id);
      throw e;
    }
  }

  async deactivate(id: string): Promise<void> {
    await this.supervisor.disable(id);
    closePluginDataDb(id);
    this.routeProviders?.unregister(id);
    db.prepare("UPDATE plugins SET status = 'inactive', enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  }

  /**
   * Update a plugin to the registry's latest version with a re-consent gate: the
   * new version's declared permissions are diffed against what the admin already
   * granted. Nothing new → the plugin is transparently restarted on the new code.
   * Anything new (a permission or an outbound host) → the plugin is left INACTIVE
   * and the delta is returned, so the caller can show it and only re-activate on
   * an explicit admin click. An update never silently widens what a plugin may do.
   *
   * Install runs first so a failed download/signature/integrity check leaves the
   * currently-running child untouched (it keeps serving the old code from memory).
   */
  async update(id: string): Promise<{ version: string; activated: boolean; newPermissions: string[]; newEgress: string[] }> {
    const before = db.prepare('SELECT enabled, granted_permissions FROM plugins WHERE id = ?').get(id) as
      | { enabled: number; granted_permissions: string }
      | undefined;
    if (!before) throw new Error(`plugin ${id} not found`);
    if (!this.registry) throw new Error('registry service unavailable');
    const wasEnabled = before.enabled === 1;
    const granted = new Set(parseArray(before.granted_permissions));

    const res = await this.registry.install(id); // swaps code + refreshes declared permissions; keeps granted

    const declared = parseArray(
      (db.prepare('SELECT permissions FROM plugins WHERE id = ?').get(id) as { permissions: string }).permissions,
    ).filter(isKnownPermission);
    const newGrants = declared.filter((p) => !granted.has(p));
    const newEgress = newGrants.filter((p) => p.startsWith(HTTP_OUTBOUND)).map((p) => p.slice(HTTP_OUTBOUND.length)).filter(Boolean);
    const newPermissions = newGrants.filter((p) => !p.startsWith(HTTP_OUTBOUND));

    if (wasEnabled) await this.deactivate(id); // stop the old child now that new code is in place
    if (newGrants.length === 0 && wasEnabled) {
      await this.activate(id); // no wider rights → transparent restart on the new code
      return { version: res.version, activated: true, newPermissions, newEgress };
    }
    // New rights requested (or it was already disabled): leave it inactive until
    // an admin explicitly consents by activating it.
    return { version: res.version, activated: false, newPermissions, newEgress };
  }

  /** Stop the plugin, remove its code, and optionally delete all its data. */
  async uninstall(id: string, deleteData: boolean): Promise<void> {
    await this.supervisor.disable(id);
    closePluginDataDb(id);
    this.routeProviders?.unregister(id);
    // Code always goes; the DB metadata + fields go so it disappears from the UI.
    fs.rmSync(pluginCodeDir(id), { recursive: true, force: true });
    db.prepare('DELETE FROM plugins WHERE id = ?').run(id);
    db.prepare('DELETE FROM plugin_settings_fields WHERE plugin_id = ?').run(id);
    if (deleteData) {
      removePluginData(id);
      db.prepare('DELETE FROM plugin_error_log WHERE plugin_id = ?').run(id);
      db.prepare("DELETE FROM settings WHERE key LIKE ?").run(`plugin:${id}:%`);
    }
  }

  isActive(id: string): boolean {
    return this.supervisor.isActive(id);
  }

  /** Declared outbound hosts (from http:outbound:<host> grants) for the frame CSP. */
  outboundHostsOf(id: string): string[] {
    const row = db.prepare('SELECT granted_permissions FROM plugins WHERE id = ?').get(id) as
      | { granted_permissions: string }
      | undefined;
    if (!row) return [];
    return parseArray(row.granted_permissions)
      .filter((p) => p.startsWith('http:outbound:'))
      .map((p) => p.slice('http:outbound:'.length))
      .filter(Boolean);
  }
  routesOf(id: string): PluginRouteInfo[] {
    return this.supervisor.routesOf(id);
  }
  hooksOf(id: string) {
    return this.supervisor.hooksOf(id);
  }
  invoke(id: string, method: string, params: Record<string, unknown>, actingUserId?: number): Promise<unknown> {
    return this.supervisor.invoke(id, method, params, { actingUserId });
  }

  /**
   * Call a plugin hook (e.g. routeProvider.routeLeg) in the isolated child.
   * Requires the plugin to be active and granted `hook:route-provider`.
   */
  invokeHook(
    pluginId: string,
    hook: string,
    method: string,
    args: unknown[],
    opts: { signal?: AbortSignal; actingUserId?: number; timeoutMs?: number } = {},
  ): Promise<unknown> {
    const row = db.prepare('SELECT granted_permissions FROM plugins WHERE id = ?').get(pluginId) as
      | { granted_permissions: string }
      | undefined;
    if (!row) throw new Error(`plugin ${pluginId} not found`);
    if (!parseArray(row.granted_permissions).includes('hook:route-provider')) {
      throw new Error(`plugin ${pluginId} lacks hook:route-provider permission`);
    }
    if (!this.supervisor.isActive(pluginId)) {
      throw new Error(`plugin ${pluginId} is not active`);
    }
    if (hook === 'routeProvider' && !this.supervisor.hooksOf(pluginId).routeProvider) {
      throw new Error(`plugin ${pluginId} does not implement routeProvider hook`);
    }
    return this.supervisor.invokeHook(pluginId, hook, method, args, opts);
  }
}

function parseArray(json: string): string[] {
  try {
    const v = JSON.parse(json || '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
function parseObject(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
/** Decrypt secret config values transparently (decrypt_api_key passes plaintext through). */
function decryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    out[k] = typeof v === 'string' ? decrypt_api_key(v) : v;
  }
  return out;
}
