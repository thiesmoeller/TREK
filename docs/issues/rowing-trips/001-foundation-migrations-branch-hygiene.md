# 001 — Foundation: migrations + branch hygiene

**Type:** AFK  
**Status:** done  
**Labels:** ready-for-agent

## Parent

[PRD: Rowing trips — PR readiness](../../prd/rowing-trips-pr-readiness.md)

## What to build

Rebase `feature/rowing_trips` onto current `dev` and fix the migration chain so shipped `dev` steps 129–130 (OAuth client-credentials column, atlas enclave `place_regions` cleanup) are **unchanged**, with rowing schema added as **one new appended migration** only: trip `default_route_leg_kind`, `rowing_speed_kmh`, `rowing_lock_delay_min`; assignment `route_leg_override`. No tidal columns in this migration.

Remove `dev.sh` from this branch (it stays on `feature/TM/rowing_dev`). Verify fresh migrate from empty DB and upgrade from a DB at version 128 reaches the final version with all steps applied in order.

## Acceptance criteria

- [ ] Migrations 129–130 match `dev` exactly (not replaced by rowing ALTERs)
- [ ] Single new migration step appends rowing columns only (no tidal fields)
- [ ] `dev.sh` is not present in diff vs intended rowing PR scope
- [ ] Server starts and `npm test` in server passes migration-related tests
- [ ] Schema version count is `dev` count + 1

## Blocked by

None — can start immediately

## User stories

19, 26
