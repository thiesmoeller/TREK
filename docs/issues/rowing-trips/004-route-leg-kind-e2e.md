# 004 — Route leg kind: trip default + per-leg override

**Type:** AFK  
**Status:** done  
**Labels:** ready-for-agent

## Parent

[PRD: Rowing trips — PR readiness](../../prd/rowing-trips-pr-readiness.md)

## What to build

End-to-end route mode selection: trip **default route leg kind** (walking / driving / row on waterways) and **per-assignment override** (inherit or explicit kind). Persist via trip and assignment APIs; expose in trip create/edit form and place inspector. Normalize kinds server-side (`routeLegKinds`). MCP trip tools accept and return the new fields. Unit tests for normalization and API round-trip.

Walking/driving legs continue to use OSRM; waterway legs may still be implemented in a later slice but the UI and persistence must work now.

## Acceptance criteria

- [ ] Create/update trip with `default_route_leg_kind`; defaults to walking when omitted
- [ ] Assignment `route_leg_override` saved and read; `inherit` uses trip default
- [ ] Trip form and place inspector show all three modes (+ inherit in inspector)
- [ ] MCP trip create/update tests cover new fields
- [ ] `routeLegKinds` unit tests pass

## Blocked by

- [001](001-foundation-migrations-branch-hygiene.md)

## User stories

1, 2, 18
