# 008 — i18n + client leg label formatting

**Type:** AFK  
**Status:** done  
**Labels:** ready-for-agent

## Parent

[PRD: Rowing trips — PR readiness](../../prd/rowing-trips-pr-readiness.md)

## What to build

Complete i18n for rowing v1: add dashboard, inspector, and map waterway keys to **all** shipped locale files under `shared`. Replace hardcoded map strings (`detected`, `unavailable`, lock popup HTML) with `useTranslation`. Format day-leg and shuttle-leg pills in the **client** from structured API fields (distance, duration, lock delay, fallback flag)—remove dependence on server English `rowingText` for display.

## Acceptance criteria

- [ ] Every locale file includes new keys (EN source; others translated or EN placeholder per project norm)
- [ ] MapView and MapViewGL use i18n for waterway popups
- [ ] Leg pills use `t()` with pluralization/minutes suffix where needed
- [ ] No new hardcoded English user strings in rowing map/route UI
- [ ] Client tests updated if they assert literal English from API

## Blocked by

- [005](005-waterway-mixed-day-route-structured-legs.md)
- [006](006-lock-context-env-delay.md)
- [007](007-gear-shuttle-map-pills.md)

## User stories

21, 22, 23
