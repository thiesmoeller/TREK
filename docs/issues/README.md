# Route modes — local issues

Tracer-bullet issues for [route-modes-plugin-architecture PRD](../prd/route-modes-plugin-architecture.md).

| # | Issue | Type | Blocked by |
|---|--------|------|------------|
| 01 | [Built-in walking/driving day routes](./route-modes-01-built-in-day-routes.md) | AFK | — |
| 02 | [Route-provider SDK contract](./route-modes-02-sdk-contract.md) | AFK | — |
| 03 | [Hook invoke and cancel](./route-modes-03-hook-invoke-cancel.md) | AFK | 02 |
| 04 | [Registry and route-modes API](./route-modes-04-registry-route-modes-api.md) | AFK | 03 |
| 05 | [Plugin dispatch and planner gating](./route-modes-05-plugin-dispatch-gating.md) | AFK | 01, 04 |
| 06 | [Trip route mode options](./route-modes-06-trip-mode-options.md) | AFK | 04, 05 |
| 07 | [Waterway plugin](./route-modes-07-waterway-plugin.md) | AFK | 02 |
| 08 | [Waterway E2E](./route-modes-08-waterway-e2e.md) | AFK | 05, 07 |
| 09 | [Docs and registry publish](./route-modes-09-docs-registry-publish.md) | HITL | 08 |

**Parallel start:** 01 and 02. **Plugin track:** 02 → 07, converges at 08 with core track 01 → … → 05.
