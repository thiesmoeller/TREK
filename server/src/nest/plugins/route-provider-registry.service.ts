import { Injectable } from '@nestjs/common';
import {
  BUILTIN_ROUTE_MODES,
  type RouteModeDescriptor,
} from '@trek/shared';
import type { RouteModeCapability } from './install/manifest';

/**
 * Maps route mode strings to the active plugin that owns them. Built-in modes
 * (walking, driving) are handled in core and are never registered here.
 */
@Injectable()
export class RouteProviderRegistryService {
  private readonly modeToPlugin = new Map<string, string>();
  private readonly pluginModes = new Map<string, RouteModeCapability[]>();

  register(pluginId: string, routeModes: RouteModeCapability[]): void {
    if (!routeModes.length) return;
    for (const descriptor of routeModes) {
      const mode = descriptor.mode.trim().toLowerCase();
      if (RouteProviderRegistryService.isBuiltinMode(mode)) {
        throw new Error(`route mode "${mode}" is built-in and cannot be registered by plugin "${pluginId}"`);
      }
      const existing = this.modeToPlugin.get(mode);
      if (existing && existing !== pluginId) {
        throw new Error(`route mode "${mode}" is already registered by plugin "${existing}"`);
      }
    }
    this.pluginModes.set(pluginId, routeModes);
    for (const descriptor of routeModes) {
      this.modeToPlugin.set(descriptor.mode.trim().toLowerCase(), pluginId);
    }
  }

  unregister(pluginId: string): void {
    const modes = this.pluginModes.get(pluginId);
    if (!modes) return;
    for (const descriptor of modes) {
      this.modeToPlugin.delete(descriptor.mode.trim().toLowerCase());
    }
    this.pluginModes.delete(pluginId);
  }

  getProvider(mode: string): string | null {
    const key = mode.trim().toLowerCase();
    if (RouteProviderRegistryService.isBuiltinMode(key)) return null;
    return this.modeToPlugin.get(key) ?? null;
  }

  getRegisteredModes(): RouteModeDescriptor[] {
    const out: RouteModeDescriptor[] = [];
    for (const descriptors of this.pluginModes.values()) {
      for (const d of descriptors) {
        out.push({
          mode: d.mode,
          label: d.label,
          allowsOptimize: d.allowsOptimize,
          options: d.options?.map((o) => ({
            key: o.key,
            type: o.type as 'number' | 'text',
            label: o.label,
            min: o.min,
            max: o.max,
            default: o.default as number | string | undefined,
          })),
        });
      }
    }
    return out;
  }

  static isBuiltinMode(mode: string): boolean {
    return (BUILTIN_ROUTE_MODES as readonly string[]).includes(mode.trim().toLowerCase());
  }

  isRegisteredMode(mode: string): boolean {
    return this.modeToPlugin.has(mode.trim().toLowerCase());
  }
}
