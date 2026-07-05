import { z } from 'zod';

/** Core OSRM modes — always available without a route-provider plugin. */
export const BUILTIN_ROUTE_MODES = ['walking', 'driving'] as const;
export type BuiltinRouteMode = (typeof BUILTIN_ROUTE_MODES)[number];

export const routeModeOptionTypeSchema = z.enum(['number', 'text']);

export const routeModeOptionSchema = z.object({
  key: z.string(),
  type: routeModeOptionTypeSchema,
  label: z.string(),
  min: z.number().optional(),
  max: z.number().optional(),
  default: z.union([z.number(), z.string()]).optional(),
});
export type RouteModeOption = z.infer<typeof routeModeOptionSchema>;

/** One selectable route mode (built-in or plugin-provided). */
export const routeModeDescriptorSchema = z.object({
  mode: z.string(),
  label: z.string(),
  /** Core i18n key for built-in modes; omitted for plugin modes. */
  labelKey: z.string().optional(),
  allowsOptimize: z.boolean(),
  options: z.array(routeModeOptionSchema).optional(),
});
export type RouteModeDescriptor = z.infer<typeof routeModeDescriptorSchema>;

/** GET /api/route-modes response envelope. */
export const routeModesResponseSchema = z.object({
  modes: z.array(routeModeDescriptorSchema),
});
export type RouteModesResponse = z.infer<typeof routeModesResponseSchema>;
