import { describe, it, expect, beforeEach } from 'vitest';
import { RouteProviderRegistryService } from '../../../src/nest/plugins/route-provider-registry.service';
import type { RouteModeCapability } from '../../../src/nest/plugins/install/manifest';
import {
  validateAssignmentRouteModeOverride,
  validateRouteModeOptions,
  validateTripRouteMode,
} from '../../../src/services/routeModeValidation';
import { ValidationError } from '../../../src/services/tripService';

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

describe('routeModeValidation', () => {
  let registry: RouteProviderRegistryService;

  beforeEach(() => {
    registry = new RouteProviderRegistryService();
    registry.register('waterway-plugin', [waterwayMode]);
  });

  describe('validateTripRouteMode', () => {
    it('allows built-in modes', () => {
      expect(() => validateTripRouteMode('walking', registry)).not.toThrow();
      expect(() => validateTripRouteMode('driving', registry)).not.toThrow();
    });

    it('allows registered plugin modes', () => {
      expect(() => validateTripRouteMode('waterway', registry)).not.toThrow();
    });

    it('rejects unregistered plugin modes', () => {
      expect(() => validateTripRouteMode('stub', registry)).toThrow(ValidationError);
      expect(() => validateTripRouteMode('stub', registry)).toThrow(/Unknown route mode/);
    });
  });

  describe('validateAssignmentRouteModeOverride', () => {
    it('allows inherit and null', () => {
      expect(() => validateAssignmentRouteModeOverride(null, registry)).not.toThrow();
      expect(() => validateAssignmentRouteModeOverride('inherit', registry)).not.toThrow();
    });

    it('validates concrete modes', () => {
      expect(() => validateAssignmentRouteModeOverride('waterway', registry)).not.toThrow();
      expect(() => validateAssignmentRouteModeOverride('unknown', registry)).toThrow(ValidationError);
    });
  });

  describe('validateRouteModeOptions', () => {
    it('accepts valid option values', () => {
      expect(() => validateRouteModeOptions({ waterway: { speedKmh: 8 } }, registry)).not.toThrow();
    });

    it('rejects unknown mode keys', () => {
      expect(() => validateRouteModeOptions({ stub: {} }, registry)).toThrow(/Unknown route mode/);
    });

    it('rejects wrong types and out-of-range values', () => {
      expect(() => validateRouteModeOptions({ waterway: { speedKmh: 'fast' } }, registry)).toThrow(/must be a number/);
      expect(() => validateRouteModeOptions({ waterway: { speedKmh: 0 } }, registry)).toThrow(/at least 1/);
      expect(() => validateRouteModeOptions({ waterway: { speedKmh: 99 } }, registry)).toThrow(/at most 30/);
    });

    it('rejects unknown option keys', () => {
      expect(() => validateRouteModeOptions({ waterway: { speedKmh: 6, extra: 1 } }, registry)).toThrow(/Unknown option/);
    });
  });
});
