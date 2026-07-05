# Waterway plugin (engine + hook)

Status: ready-for-agent  
Type: AFK  
Parent: [PRD: Day-plan route modes with plugin route providers](../prd/route-modes-plugin-architecture.md)

## What to build

Create **`trek-plugin-waterway`** as an `integration` plugin (manifest **`id`: `waterway`**, repo name `trek-plugin-waterway`). Implement `hooks.routeProvider` with vendored waterway routing logic from the feature branch (pure JS graph + snap + pathfind).

End-to-end in plugin scope (via `createMockHost` and plugin tests):

- `modes()` → `['waterway']`
- `routeLeg()` fetches Overpass (mocked in tests), uses `db:own` cache, returns coordinates and distance
- Manifest declares `hook:route-provider`, `db:own`, `http:outbound:overpass-api.de`, egress, and `capabilities.routeModes` with `allowsOptimize: false` and `speedKmh` option schema
- Instance setting for optional Overpass mirror URL
- Port graph/routing unit tests from the feature-branch waterway package

Core TREK integration is **not** required to complete this slice — only plugin correctness against the SDK contract.

## Acceptance criteria

- [ ] Plugin scaffolds with `trek-plugin-sdk create --type integration` and valid manifest
- [ ] `routeLeg` returns valid geometry for mocked Overpass graph data
- [ ] Cache reduces duplicate Overpass fetches (observable in plugin tests)
- [ ] Manifest validates against SDK rules including `capabilities.routeModes`
- [ ] Graph/snap/pathfind tests pass in plugin repo without monorepo waterway package
- [ ] README documents local dev with `trek-plugin-sdk dev` and permissions

## Blocked by

- [route-modes-02-sdk-contract](./route-modes-02-sdk-contract.md)

## User stories

2, 26, 27, 28, 30
