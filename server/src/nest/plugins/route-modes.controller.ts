import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  BUILTIN_ROUTE_MODES,
  type RouteModeDescriptor,
  type RouteModesResponse,
} from '@trek/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RouteProviderRegistryService } from './route-provider-registry.service';

/**
 * GET /api/route-modes — built-in OSRM modes plus active plugin-registered modes.
 */
@Controller('api/route-modes')
@UseGuards(JwtAuthGuard)
export class RouteModesController {
  constructor(private readonly registry: RouteProviderRegistryService) {}

  @Get()
  list(): RouteModesResponse {
    const builtins: RouteModeDescriptor[] = BUILTIN_ROUTE_MODES.map((mode) => ({
      mode,
      label: mode,
      labelKey: `routeMode.${mode}`,
      allowsOptimize: true,
    }));
    return { modes: [...builtins, ...this.registry.getRegisteredModes()] };
  }
}
