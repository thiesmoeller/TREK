# 003 — rowing-planner workspace + CI

**Type:** AFK  
**Status:** done  
**Labels:** ready-for-agent

## Parent

[PRD: Rowing trips — PR readiness](../../prd/rowing-trips-pr-readiness.md)

## What to build

Integrate `packages/rowing-planner` into the root npm workspace with a single lockfile (remove nested `package-lock.json` if present). Expose a small stable API: types, geo helpers, `routeWaterwayLeg`, lock extraction along geometry—no tide exports for v1. Ensure root `npm test` (or documented workspace script) runs rowing-planner unit tests. Server depends on the workspace package via `file:` or workspace name with justification noted for PR.

## Acceptance criteria

- [ ] `rowing-planner` listed in root workspaces
- [ ] No separate nested lockfile for the package
- [ ] `npm test` from repo root executes rowing-planner tests
- [ ] Server builds and resolves the package
- [ ] Package README or index comment documents intended public surface for future extraction

## Blocked by

None — can start immediately (may land after 001 in same PR)

## User stories

20, 30
