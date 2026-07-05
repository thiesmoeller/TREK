import { Module } from '@nestjs/common';
import { PluginsController } from './plugins.controller';
import { PluginsFeedController } from './plugins-feed.controller';
import { PluginsProxyController } from './plugins-proxy.controller';
import { PluginFrameController } from './plugin-frame.controller';
import { RouteModesController } from './route-modes.controller';
import { PluginsService } from './plugins.service';
import { PluginRuntimeService } from './plugin-runtime.service';
import { PluginRegistryService } from './registry/registry.service';
import { RouteProviderRegistryService } from './route-provider-registry.service';

/**
 * Plugin system (#plugins). M0 read side + M2 isolated runtime + M3 frontend:
 * the runtime service owns the process supervisor and boots active plugins on
 * startup; the proxy forwards /api/plugins/:id/* to the child; the feed lists
 * active plugins for the client; the frame controller serves sandboxed page/
 * widget assets at /plugin-frame/:id/*.
 */
@Module({
  controllers: [PluginsController, PluginsFeedController, PluginsProxyController, PluginFrameController, RouteModesController],
  providers: [PluginsService, PluginRuntimeService, PluginRegistryService, RouteProviderRegistryService],
  exports: [RouteProviderRegistryService, PluginRuntimeService],
})
export class PluginsModule {}
