# 005 — Waterway mixed day route + structured leg payload

**Type:** AFK  
**Status:** done  
**Labels:** ready-for-agent

## Parent

[PRD: Rowing trips — PR readiness](../../prd/rowing-trips-pr-readiness.md)

## What to build

Compute a full **day route** with per-leg `kind`: waterway segments use `rowing-planner` + Overpass graph; walking/driving use OSRM. On graph failure, emit a **straight-line fallback** leg with `isFallback: true` and a distinguishable label hook (client may use structured field, not server prose). API returns **structured metrics** per leg: `distanceM`, `durationS`, `kind`, polyline, `isFallback`, `lockCount`/`lockDelayS` as zero until slice 006.

Client: `useRouteCalculation` draws the mixed route on the map with basic leg pills driven by structured fields (English interim OK until slice 008).

## Acceptance criteria

- [ ] Day with two+ geocoded places and waterway kind returns a multi-point polyline for waterway legs
- [ ] OSRM used for walking/driving legs per effective kind
- [ ] Fallback leg when graph routing fails; `isFallback` set
- [ ] No server `rowingText` required for client to show distance/duration
- [ ] Integration/unit tests with mocked Overpass/OSRM

## Blocked by

- [003](003-rowing-planner-workspace-ci.md)
- [004](004-route-leg-kind-e2e.md)

## User stories

3, 4, 11
