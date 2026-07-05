# Route provider registry and route-modes API

Status: ready-for-agent  
Type: AFK  
Parent: [PRD: Day-plan route modes with plugin route providers](../prd/route-modes-plugin-architecture.md)

## What to build

Wire a **route provider registry** on the host: when an integration plugin with `hook:route-provider` activates, register each `capabilities.routeModes[].mode` → plugin id. Expose registered modes to the client via **`GET /api/route-modes`**.

End-to-end behavior:

- Built-in modes `walking` and `driving` always appear in the API response with core i18n label keys, `allowsOptimize: true`, and no option schemas.
- Active plugin modes appear with manifest `label`, `allowsOptimize`, and `options` schema.
- **Conflict policy:** activating a second plugin that claims an already-registered mode **fails activation** with a clear error.
- Deactivating/unloading a plugin removes its modes from the registry.

Routing dispatch into the registry is **not** required in this slice — only registration, conflict handling, and discovery API.

## Acceptance criteria

- [ ] Activating a test route-provider plugin registers its declared modes
- [ ] Activating a second plugin for the same mode fails with an actionable error
- [ ] `GET /api/route-modes` returns built-ins plus active plugin modes and option schemas
- [ ] Deactivating a plugin removes its modes from subsequent API responses
- [ ] Integration or unit tests cover registration, conflict, and API shape

## Blocked by

- [route-modes-03-hook-invoke-cancel](./route-modes-03-hook-invoke-cancel.md)

## User stories

4, 11, 20, 33
