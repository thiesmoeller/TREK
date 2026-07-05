# Route-provider SDK contract

Status: ready-for-agent  
Type: AFK  
Parent: [PRD: Day-plan route modes with plugin route providers](../prd/route-modes-plugin-architecture.md)

## What to build

Freeze the **plugin author contract** for route providers so core and `trek-plugin-waterway` can develop in parallel. No host wiring in this slice — types, manifest validation, and permission string only.

Contract shapes (decision from PRD):

```ts
interface RouteLegRequest {
  mode: string;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  legKey: string;
  tripId: number;
  modeOptions?: Record<string, unknown>;
}

interface RouteLegResult {
  coords: [number, number][];
  distanceM: number;
  durationS?: number;
  isApproximate?: boolean;
}

interface RouteProvider {
  modes(): string[];
  routeLeg(req: RouteLegRequest): Promise<RouteLegResult>;
}
```

Manifest extension:

```json
"capabilities": {
  "routeModes": [{
    "mode": "waterway",
    "label": "Waterway",
    "allowsOptimize": false,
    "options": [{
      "key": "speedKmh",
      "type": "number",
      "label": "Speed (km/h)",
      "min": 1,
      "max": 30,
      "default": 6
    }]
  }]
}
```

Add `hook:route-provider` to known permissions. Extend `PluginDefinition.hooks` with optional `routeProvider`. Validate manifest `capabilities.routeModes` at install/pack time.

## Acceptance criteria

- [ ] SDK exports `RouteProvider`, `RouteLegRequest`, `RouteLegResult` and documents them
- [ ] `definePlugin` accepts `hooks.routeProvider`
- [ ] `hook:route-provider` is a recognized permission in manifest validation
- [ ] Manifest parser validates `capabilities.routeModes` shape (mode, label, allowsOptimize, options array with key/type/label)
- [ ] Invalid manifests fail validation with clear errors
- [ ] SDK unit tests cover type surface and manifest validation cases

## Blocked by

None — can start immediately.

## User stories

6
