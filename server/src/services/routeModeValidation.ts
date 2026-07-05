import type { RouteModeDescriptor } from '@trek/shared';
import { RouteProviderRegistryService } from '../nest/plugins/route-provider-registry.service';
import { ValidationError } from './tripService';

export type RouteModeRegistry = Pick<
  RouteProviderRegistryService,
  'isRegisteredMode' | 'getRegisteredModes'
>;

function normalizeMode(mode: string): string {
  return mode.trim().toLowerCase();
}

function descriptorForMode(registry: RouteModeRegistry, mode: string): RouteModeDescriptor | undefined {
  const key = normalizeMode(mode);
  return registry.getRegisteredModes().find((d) => normalizeMode(d.mode) === key);
}

/** Reject plugin modes that are not currently registered; built-ins always allowed. */
export function validateTripRouteMode(mode: string | null | undefined, registry: RouteModeRegistry): void {
  if (mode === null || mode === undefined) return;
  const normalized = normalizeMode(mode);
  if (!normalized) return;
  if (RouteProviderRegistryService.isBuiltinMode(normalized)) return;
  if (!registry.isRegisteredMode(normalized)) {
    throw new ValidationError(`Unknown route mode: ${normalized}`);
  }
}

/** `inherit` and null clear the override; other values must be built-in or registered. */
export function validateAssignmentRouteModeOverride(
  override: string | null | undefined,
  registry: RouteModeRegistry,
): void {
  if (override === null || override === undefined) return;
  const normalized = normalizeMode(override);
  if (!normalized || normalized === 'inherit') return;
  validateTripRouteMode(normalized, registry);
}

function validateOptionValue(
  modeKey: string,
  opt: NonNullable<RouteModeDescriptor['options']>[number],
  value: unknown,
): void {
  if (opt.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ValidationError(`route_mode_options.${modeKey}.${opt.key} must be a number`);
    }
    if (opt.min !== undefined && value < opt.min) {
      throw new ValidationError(`route_mode_options.${modeKey}.${opt.key} must be at least ${opt.min}`);
    }
    if (opt.max !== undefined && value > opt.max) {
      throw new ValidationError(`route_mode_options.${modeKey}.${opt.key} must be at most ${opt.max}`);
    }
    return;
  }
  if (opt.type === 'text') {
    if (typeof value !== 'string') {
      throw new ValidationError(`route_mode_options.${modeKey}.${opt.key} must be a string`);
    }
  }
}

/** Validate option keys/values against active provider schemas; reject unknown mode keys. */
export function validateRouteModeOptions(
  options: Record<string, Record<string, unknown>> | null | undefined,
  registry: RouteModeRegistry,
): void {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return;

  for (const [modeKey, values] of Object.entries(options)) {
    const descriptor = descriptorForMode(registry, modeKey);
    if (!descriptor) {
      throw new ValidationError(`Unknown route mode in route_mode_options: ${modeKey}`);
    }
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      throw new ValidationError(`route_mode_options.${modeKey} must be an object`);
    }

    const schemaKeys = new Set((descriptor.options ?? []).map((o) => o.key));
    for (const key of Object.keys(values)) {
      if (!schemaKeys.has(key)) {
        throw new ValidationError(`Unknown option "${key}" for route mode ${modeKey}`);
      }
    }
    for (const opt of descriptor.options ?? []) {
      if (!(opt.key in values)) continue;
      validateOptionValue(normalizeMode(modeKey), opt, values[opt.key]);
    }
  }
}
