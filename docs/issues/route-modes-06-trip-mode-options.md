# Trip route mode options

Status: ready-for-agent  
Type: AFK  
Parent: [PRD: Day-plan route modes with plugin route providers](../prd/route-modes-plugin-architecture.md)

## What to build

Add **mode-specific trip options** as generic JSON on the trip, driven by plugin-declared option schemas — no waterway-specific columns in core.

End-to-end behavior:

- Trips persist `route_mode_options` as JSON keyed by mode id (e.g. `{ "waterway": { "speedKmh": 6 } }`).
- On trip save, validate each key against an active provider’s option schema (type, min, max, required keys).
- Trip form renders generic fields (number, text) from schemas for modes that are active or selected as default.
- Mixed day route service passes the relevant `modeOptions` slice into `RouteLegRequest` for plugin legs (host does not interpret waterway-specific semantics).

## Acceptance criteria

- [ ] Schema migration adds `route_mode_options` with sensible default `{}`
- [ ] API rejects invalid option values (wrong type, out of range, unknown mode key when provider inactive)
- [ ] Trip form shows option fields from manifest schema when waterway (or stub) provider is active
- [ ] Plugin `routeLeg` receives `modeOptions` matching saved trip data (verified via stub or waterway plugin test)
- [ ] Tests cover validation success, validation failure, and round-trip persistence

## Blocked by

- [route-modes-04-registry-route-modes-api](./route-modes-04-registry-route-modes-api.md)
- [route-modes-05-plugin-dispatch-gating](./route-modes-05-plugin-dispatch-gating.md)

## User stories

10
