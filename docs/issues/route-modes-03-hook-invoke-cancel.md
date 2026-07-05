# Hook invoke and cancel

Status: ready-for-agent  
Type: AFK  
Parent: [PRD: Day-plan route modes with plugin route providers](../prd/route-modes-plugin-architecture.md)

## What to build

Add **shared host→child hook invoke** infrastructure so the host can call a plugin’s `hooks.routeProvider.routeLeg` over the existing supervisor channel. Support **cancel by invoke ID** when the upstream request aborts (e.g. user switches days).

End-to-end verifiable with a **test integration plugin** that implements `RouteProvider` and returns deterministic geometry (no real Overpass).

Behavior:

- On plugin load, child reports hook availability to host (alongside routes/jobs).
- Host invokes `routeLeg` via a dedicated invoke method (e.g. `invoke.hook` with hook name + method + params).
- Host tracks pending invokes; on cancel, sends cancel envelope; child aborts in-flight work via per-invoke `AbortController` (relevant for future `fetch` in route providers).
- Photo and calendar hooks are **not** wired — only the invoke plumbing they will reuse.

## Acceptance criteria

- [ ] Host can call `routeLeg` on an active test plugin and receive `RouteLegResult`
- [ ] Invoke fails clearly when plugin is inactive or lacks `hook:route-provider`
- [ ] Cancel message aborts a slow in-flight hook invoke; host promise rejects or resolves appropriately without late updates
- [ ] Supervisor tests cover successful invoke and cancel paths
- [ ] Test plugin in server test suite demonstrates end-to-end hook invoke without manual steps

## Blocked by

- [route-modes-02-sdk-contract](./route-modes-02-sdk-contract.md)

## User stories

5, 13, 29
