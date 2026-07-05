# Waterway end-to-end on shared branch

Status: ready-for-agent  
Type: AFK  
Parent: [PRD: Day-plan route modes with plugin route providers](../prd/route-modes-plugin-architecture.md)

## What to build

Integrate **trek-plugin-waterway** with a TREK instance on the shared development branch: activate plugin, plan a trip with waterway mode, and verify full planner behavior.

End-to-end behavior:

- Admin installs and activates the waterway plugin
- `GET /api/route-modes` lists waterway with option schema
- Trip default or assignment override set to waterway; `speedKmh` option affects duration estimate
- Day route map shows waterway geometry along OSM waterways (not straight lines) for suitable stops
- Sidebar route pills align with map legs
- Switching days quickly cancels in-flight waterway routing without stale map updates
- Deactivating plugin mid-session degrades to approximate legs on next route fetch

## Acceptance criteria

- [ ] Waterway appears in trip form and inspector only when plugin is active
- [ ] Day route returns non-approximate waterway geometry for a known test corridor (manual or integration test with recorded Overpass fixture)
- [ ] `route_mode_options.waterway.speedKmh` changes reflected in leg duration
- [ ] Abort during route fetch does not apply late geometry to the map
- [ ] Plugin deactivated → waterway not selectable; existing route fetch degrades gracefully
- [ ] Documented manual test steps or automated e2e covering the above

## Blocked by

- [route-modes-05-plugin-dispatch-gating](./route-modes-05-plugin-dispatch-gating.md)
- [route-modes-07-waterway-plugin](./route-modes-07-waterway-plugin.md)

## User stories

16, 22, 30
