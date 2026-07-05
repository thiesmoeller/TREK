import { describe, it, expect, beforeEach } from 'vitest';
import { RouteProviderRegistryService } from '../../../src/nest/plugins/route-provider-registry.service';
import type { RouteModeCapability } from '../../../src/nest/plugins/install/manifest';

const waterwayMode: RouteModeCapability = {
  mode: 'waterway',
  label: 'Waterway',
  allowsOptimize: false,
  options: [{
    key: 'speedKmh',
    type: 'number',
    label: 'Speed (km/h)',
    min: 1,
    max: 30,
    default: 6,
  }],
};

const stubMode: RouteModeCapability = {
  mode: 'stub',
  label: 'Stub',
  allowsOptimize: false,
  options: [],
};

describe('RouteProviderRegistryService', () => {
  let registry: RouteProviderRegistryService;

  beforeEach(() => {
    registry = new RouteProviderRegistryService();
  });

  it('registers plugin modes and exposes descriptors', () => {
    registry.register('waterway-plugin', [waterwayMode]);
    expect(registry.getProvider('waterway')).toBe('waterway-plugin');
    expect(registry.isRegisteredMode('waterway')).toBe(true);
    expect(registry.getRegisteredModes()).toEqual([{
      mode: 'waterway',
      label: 'Waterway',
      allowsOptimize: false,
      options: [{
        key: 'speedKmh',
        type: 'number',
        label: 'Speed (km/h)',
        min: 1,
        max: 30,
        default: 6,
      }],
    }]);
  });

  it('rejects registering a built-in mode', () => {
    expect(() => registry.register('bad', [{
      mode: 'walking',
      label: 'Walking',
      allowsOptimize: true,
      options: [],
    }])).toThrow(/built-in/);
  });

  it('rejects duplicate mode from a second plugin', () => {
    registry.register('plugin-a', [waterwayMode]);
    expect(() => registry.register('plugin-b', [waterwayMode])).toThrow(/already registered/);
  });

  it('unregisters all modes for a plugin on deactivate', () => {
    registry.register('plugin-a', [waterwayMode, stubMode]);
    expect(registry.getProvider('waterway')).toBe('plugin-a');
    expect(registry.getProvider('stub')).toBe('plugin-a');
    registry.unregister('plugin-a');
    expect(registry.getProvider('waterway')).toBeNull();
    expect(registry.getRegisteredModes()).toEqual([]);
  });

  it('isBuiltinMode identifies walking and driving', () => {
    expect(RouteProviderRegistryService.isBuiltinMode('walking')).toBe(true);
    expect(RouteProviderRegistryService.isBuiltinMode('driving')).toBe(true);
    expect(RouteProviderRegistryService.isBuiltinMode('waterway')).toBe(false);
  });
});
