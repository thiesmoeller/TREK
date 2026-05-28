# 007 — Gear shuttle route + map pills

**Type:** AFK  
**Status:** done  
**Labels:** ready-for-agent

## Parent

[PRD: Rowing trips — PR readiness](../../prd/rowing-trips-pr-readiness.md)

## What to build

**Gear/luggage shuttle**: server builds driving route between consecutive **geocoded** accommodations (OSRM), separate from day-plan rowing route. Trip API endpoint returns segments with structured distance/duration per leg. Client draws orange (or existing) polyline **and** map pills per shuttle leg matching day-route pill pattern. Client only requests shuttle route when **at least two accommodations have coordinates** (not merely count ≥ 2).

## Acceptance criteria

- [ ] Two geocoded accommodations produce shuttle polyline + per-leg metrics
- [ ] Zero or one geocoded accommodation → no shuttle API call from client
- [ ] Shuttle route ignores non-accommodation day places
- [ ] Map pills show distance/duration for each shuttle leg
- [ ] Unit test for `gearShuttleRouteService` with mocked OSRM

## Blocked by

- [001](001-foundation-migrations-branch-hygiene.md)

## User stories

13, 14, 15, 16, 17
