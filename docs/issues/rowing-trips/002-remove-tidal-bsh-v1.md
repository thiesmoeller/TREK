# 002 — Remove tidal/BSH from v1

**Type:** AFK  
**Status:** done  
**Labels:** ready-for-agent

## Parent

[PRD: Rowing trips — PR readiness](../../prd/rowing-trips-pr-readiness.md)

## What to build

Strip tidal planning from the rowing branch for v1: remove BSH tide fetching, suggested departure windows, tidal feature annotations in API responses, and any DB/API fields for `rowing_tidal_*` / tide safety buffers. Keep `rowing-planner` exports limited to routing + lock context. Server mixed-day route must not call tide code paths; tests that only assert tides should be removed or rewritten.

End-to-end: a waterway leg returns lock-related context only; no tide events or departure windows in payloads.

## Acceptance criteria

- [ ] No tidal columns in migrations or trip create/update API for v1
- [ ] `bshTides` (or equivalent) not imported by production server path for day routes
- [ ] Mixed day route tests pass without tide fixtures
- [ ] `rowing-planner` public index does not export tide APIs used by server in v1

## Blocked by

- [001](001-foundation-migrations-branch-hygiene.md)

## User stories

27
