# Day-plan route modes

Day-plan **route modes** control how TREK routes legs between stops on a day: walking and driving use OSRM built into core; optional modes (such as **waterway**) are supplied by **route-provider plugins**.

## Built-in modes

These are always available on every TREK instance:

| Mode | Routing | Optimize route |
|------|---------|----------------|
| `walking` | OSRM foot profile | Yes |
| `driving` | OSRM car profile | Yes |

Set a trip **default route mode** in the trip form. Override individual legs in the place inspector (**Route mode** → trip default / walk / drive / plugin mode).

## Plugin route modes

Integration plugins can register additional modes via the `hook:route-provider` permission and `capabilities.routeModes` in their manifest.

1. Install the plugin (Admin → Plugins).
2. Activate it and consent to its permissions.
3. The new mode appears in trip and assignment selectors and in `GET /api/route-modes`.

If a plugin is deactivated, its mode disappears from selectors. Trips that still reference the mode keep the value in the database but the next route fetch uses an approximate straight-line leg instead of failing the whole day.

### Waterway plugin

The community **trek-plugin-waterway** adds `waterway` routing along OpenStreetMap rivers and canals via Overpass. See the plugin README for install steps, permissions, and the optional Overpass mirror instance setting.

Trip option **Speed (km/h)** (`route_mode_options.waterway.speedKmh`) affects duration estimates. Waterway mode disables **Optimize route** because stop order is not assumed to follow navigable water.

## API

- `GET /api/route-modes` — list built-in and currently registered plugin modes (labels, `allowsOptimize`, option schemas).
- `GET /api/trips/:tripId/days/:dayId/route` — server-calculated mixed day route (geometry + structured legs, including hotel bookends when applicable).

Saving a trip or assignment with a plugin mode that is not currently registered returns **400**.

## For plugin authors

See [[Plugin Development|Plugin-Development]] and the `RouteProvider` contract in `trek-plugin-sdk` (`RouteLegRequest`, `RouteLegResult`, `hooks.routeProvider`).
