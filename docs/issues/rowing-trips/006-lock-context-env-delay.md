# 006 — Lock context + env/trip delay

**Type:** AFK  
**Status:** done  
**Labels:** ready-for-agent

## Parent

[PRD: Rowing trips — PR readiness](../../prd/rowing-trips-pr-readiness.md)

## What to build

For successful waterway graph routes, detect locks near the leg geometry via OpenStreetMap, attach `waterwayContext.locks` with available tags (name, ref, opening hours, phone, website, VHF). Apply duration adjustment: `lockDelayS = lockCount * lockDelayMin` where `lockDelayMin = trip.rowing_lock_delay_min ?? process.env.TREK_LOCK_DELAY_MIN ?? 15`. Wire `rowingSpeedKmh = trip.rowing_speed_kmh ?? TREK_ROWING_KMH ?? TREK_PADDLE_KMH ?? 6` for base rowing duration.

Map shows lock annotations on the route (not as day-plan places). **No** lock fetch on fallback legs in v1. Elbe Tangermünde–Havelberg test scenario remains green.

## Acceptance criteria

- [ ] `TREK_LOCK_DELAY_MIN` env changes default delay when trip column null
- [ ] Trip `rowing_lock_delay_min` overrides env
- [ ] `TREK_ROWING_KMH` used when trip speed null
- [ ] Locks appear in API and map for graph-routed waterway legs
- [ ] Fallback legs have empty locks and documented behavior
- [ ] `waterwayContextService` + `mixedDayRouteService` tests include Havelberg lock case

## Blocked by

- [005](005-waterway-mixed-day-route-structured-legs.md)

## User stories

5, 6, 7, 8, 9, 10, 12, 28, 29
