# Plugin leg dispatch and planner gating

Status: ready-for-agent  
Type: AFK  
Parent: [PRD: Day-plan route modes with plugin route providers](../prd/route-modes-plugin-architecture.md)

## What to build

Connect **mixed day route calculation** to the route provider registry and gate the planner UI on available modes.

End-to-end behavior:

- For legs whose effective mode is not a built-in, mixed day route service calls the registry → plugin `routeLeg` via hook invoke.
- Trip save and assignment update **reject** persisting a plugin mode that is not currently registered (built-ins always allowed).
- Trip form and place inspector mode selectors load from `GET /api/route-modes` — plugin modes appear only when registered.
- **Optimize route** is disabled when any effective leg before the last stop uses a mode with `allowsOptimize: false`.
- If a plugin mode is in persisted data but the provider is gone mid-session, legs degrade to straight line + `isApproximate` + warning (HTTP 200).
- Plugin leg failure (thrown error) uses the same per-leg approximate fallback as built-in OSRM failures.

Use a **test stub plugin** (from slice 03) to verify dispatch without the real waterway engine.

## Acceptance criteria

- [ ] Mixed day route with an active stub plugin returns stub geometry for plugin mode legs
- [ ] Saving `default_route_mode` or override to an unregistered plugin mode returns 4xx
- [ ] UI selectors omit plugin modes when plugin is inactive; include them when active
- [ ] Optimize control disabled when stub mode has `allowsOptimize: false`
- [ ] Provider inactive at route time → approximate legs, not 5xx
- [ ] Plugin throw on one leg → approximate that leg only; other legs unaffected
- [ ] Tests cover dispatch, write rejection, and fallback paths

## Blocked by

- [route-modes-01-built-in-day-routes](./route-modes-01-built-in-day-routes.md)
- [route-modes-04-registry-route-modes-api](./route-modes-04-registry-route-modes-api.md)

## User stories

12, 16, 21
