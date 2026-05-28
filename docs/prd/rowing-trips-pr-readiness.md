# PRD: Rowing trips — waterway routing, gear shuttle, PR readiness

Status: draft (local). Target branch: `feature/rowing_trips` → `dev`.  
Source: code review vs `dev`, grill-me decisions (2026-05-28).

---

## Problem Statement

Organizers of multi-day rowing tours (club trips, river camps) need TREK to plan two linked views of the same trip: a **waterway itinerary** for the crew (launch points, locks, landings, estimated rowing time) and a **road shuttle route** for luggage, trailers, and support drivers between overnight accommodations. Today, day-plan routing assumes walking or driving via OSRM; there is no first-class “row on waterways” mode, lock context on the map, or a separate gear-shuttle layer derived from accommodations.

Upstream maintainers require PRs against `dev` that are focused, non-breaking (including migrations), fully i18n’d, tested, and aligned with documented behavior—without unrelated tooling or half-shipped subsystems.

## Solution

Ship a **rowing trips v1** feature that:

1. Lets trips default to **row on waterways** (or walking/driving) and allows per-assignment leg overrides.
2. Computes **mixed day routes**: waterway legs via an extractable `rowing-planner` workspace package (OSM graph + shortest path), other legs via OSRM, with straight-line fallback when the graph fails.
3. Annotates waterway legs with **lock context** from OpenStreetMap (names, tags, configurable delay)—without tidal/BSH planning in v1.
4. Draws a **gear/luggage shuttle** polyline between consecutive geocoded accommodations, with **map pills** showing distance and duration per shuttle leg (separate from rowing legs).
5. Documents the workflow in wiki **Rowing Trips and Luggage Bus** and meets CONTRIBUTING standards: **append-only migrations**, all locales, client-side formatting of leg labels, root workspace for `rowing-planner`, no `dev.sh` in this PR.

Configuration: **`TREK_LOCK_DELAY_MIN`** and **`TREK_ROWING_KMH`** as server-wide defaults; per-trip **`rowing_lock_delay_min`** and **`rowing_speed_kmh`** override when set. Trip-form UI for rowing speed is **out of scope** for v1.

## User Stories

1. As a trip organizer, I want to create a trip with default route mode **Row on waterways**, so that most day legs route on the OSM waterway graph without per-place setup.
2. As an organizer, I want to override a single place-to-place leg to walking or driving, so that short land transfers are not forced onto water.
3. As a rower, I want the day plan map to show the water route between consecutive day places, so that I can see the intended river path for that day.
4. As a rower, I want distance and estimated rowing time on each waterway leg, so that I can judge daily distance.
5. As an organizer, I want lock delay included in duration when locks are detected near the route, so that planning time is realistic.
6. As an organizer, I want **`TREK_LOCK_DELAY_MIN`** to set the default minutes-per-lock on the server, so that ops can tune delay without per-trip DB edits.
7. As an organizer, I want **`rowing_lock_delay_min`** on a trip to override the server default when set, so that club-specific assumptions can be stored.
8. As a rower, I want detected locks shown as map annotations (not day-plan places), so that the itinerary stays readable.
9. As a rower, I want lock names, refs, opening hours, phone, website, and VHF when OSM provides them, so that I can contact or plan around locks.
10. As an organizer, I want opening hours treated as informational only in v1, so that expectations match capability (no schedule solver).
11. As a rower, when waterway routing fails, I want a labeled straight-line fallback, so that I know the segment is not graph-routed.
12. As an organizer, I accept that **no lock annotations appear on fallback legs in v1**, so that scope stays bounded (documented in wiki troubleshooting).
13. As a support driver, I want a **gear shuttle route** between consecutive accommodations, so that I know where to drive bags overnight.
14. As a support driver, I want shuttle legs labeled with distance and duration on the map, so that I can compare driving legs without opening another tool.
15. As an organizer, I want the shuttle route independent of rowing stops, so that a lunch stop on the river does not distort the bus route.
16. As an organizer, I want at least two **geocoded** accommodations before a shuttle line is drawn, so that the map does not imply a false route.
17. As an organizer, I want the client not to call the shuttle API when accommodations lack coordinates, so that useless requests are avoided.
18. As a collaborator, I want trip default route mode and leg overrides persisted via existing trip/assignment APIs, so that MCP and web stay consistent.
19. As a maintainer, I want migrations **129–130 on `dev` preserved** and rowing schema added as **one new appended migration**, so that OAuth and atlas fixes are not skipped.
20. As a maintainer, I want `rowing-planner` in root npm workspaces with a single lockfile, so that CI runs its tests and dependencies are justified.
21. As a user in any of 15 languages, I want new dashboard and inspector strings in all locale files, so that the UI does not regress i18n.
22. As a user in any language, I want map popups for waterway context to use i18n keys, so that hardcoded English is not introduced.
23. As a user in any language, I want leg pills built from **structured route fields** formatted in the client, so that rowing/fallback/lock suffixes are translatable.
24. As an organizer, I want wiki documentation for rowing + luggage bus workflow, checklist, and troubleshooting, so that the feature is discoverable.
25. As a maintainer, I want unit tests for lock extraction, mixed waterway legs (e.g. Elbe/Havelberg), route leg kind normalization, and gear shuttle aggregation, so that coverage stays high.
26. As a maintainer, I want **`dev.sh` excluded** from this PR (kept on `feature/TM/rowing_dev`), so that the PR stays single-purpose.
27. As a maintainer, I want **no tidal/BSH planning** in v1, so that reviewers are not asked to approve half-surfaced hydrology.
28. As an organizer, I want **`TREK_ROWING_KMH`** as server default speed when trip speed is unset, so that deployments can tune estimates globally.
29. As an organizer, I want new trips to default to 6 km/h in the database when speed is unset, so that behavior is predictable without env vars.
30. As a developer, I want `rowing-planner` to expose a small stable API (route leg, annotate context, geo helpers), so that it can be extracted or reused later.

## Implementation Decisions

### Schema and migrations

- **Restore** `dev` migration steps 129 (OAuth `allows_client_credentials`) and 130 (atlas `place_regions` enclave cleanup) unchanged.
- **Append** one new migration step that adds rowing-related columns only:
  - Trip: `default_route_leg_kind`, `rowing_speed_kmh`, `rowing_lock_delay_min`.
  - Assignment: `route_leg_override` (`inherit` | `waterway` | `walking` | `driving`).
- Do **not** add tidal columns (`rowing_tidal_planning_enabled`, preferred windows, tide safety buffer) in v1.
- Never rewrite existing migration indices.

### Configuration precedence

```
lockDelayMin = trip.rowing_lock_delay_min ?? env.TREK_LOCK_DELAY_MIN ?? 15
rowingSpeedKmh = trip.rowing_speed_kmh ?? env.TREK_ROWING_KMH ?? env.TREK_PADDLE_KMH ?? 6
```

### Deep module: `rowing-planner` (workspace package)

- **Responsibilities:** build waterway graph from Overpass, shortest path between coordinates, extract lock features along geometry, shared geo utilities.
- **Public surface (keep small and stable):** types for graph/route/locks, `routeWaterwayLeg`, lock context helpers used by server—no BSH/tide exports in v1.
- Registered in root npm **workspaces**; no nested `package-lock.json`; tests run from root/workspace scripts.
- Structure and API stay concise so the package can be extracted later without churn.

### Server orchestration

- **`routeLegKinds`:** normalize trip default and assignment override; effective leg kind per segment.
- **`mixedDayRouteService`:** dispatch waterway vs OSRM per leg; attach `waterwayContext` (locks, delays, adjusted duration); emit **structured leg metrics** (not English sentences).
- **`waterwayContextService`:** Overpass lock detection along routed geometry; lock count × delay; no tide/hydrology in v1.
- **`waterwayRouting` / `osrmRouting`:** thin adapters to rowing-planner and existing OSRM client.
- **`gearShuttleRouteService`:** consecutive geocoded accommodations → OSRM driving legs; per-leg metrics for map pills.
- **Trips route:** gear shuttle endpoint; client only prefetches when ≥2 accommodations have coordinates.

### API contract (day route / legs)

- Leg payload: `kind`, polyline, `distanceM`, `durationS`, `lockDelayS`, `lockCount`, `isFallback`, `waterwayContext` (locks with OSM tags).
- **Client** composes localized pill strings from structured fields; do not rely on server `rowingText` for display.
- Breaking removal of legacy `RouteSegment.distance` / `RouteWithLegs` is **accepted** for this PR (note in PR description).

### Client

- **Trip form:** default route leg kind (walking / driving / row on waterways).
- **Place inspector:** per-leg override.
- **`useRouteCalculation`:** mixed day route + gear shuttle; leg pills for **day legs and shuttle legs**.
- **Map (Leaflet + Mapbox GL):** waterway popups via `useTranslation`.
- **i18n:** new keys in **all** shipped locales (dashboard, inspector, map waterway strings).

### Wiki

- Align **Rowing Trips and Luggage Bus** with v1: env vars, fallback behavior, **no locks on fallback in v1**, gear shuttle pills, **tidal/hydrology out of scope**.

### Branch hygiene

- **`dev.sh`:** remove from `feature/rowing_trips`; keep on `feature/TM/rowing_dev`.
- **Do not** open issues or PRs on `mauriceboe/TREK` without explicit maintainer approval (Discord `#github-pr` first).

## Testing Decisions

**Good tests** assert observable outputs—route kind, geometry, lock annotations, duration with delay, shuttle segment count—without binding to Overpass query string internals.

| Module | What to verify | Prior art |
|--------|----------------|-----------|
| `routeLegKinds` | Normalization, override parsing | `routeLegKinds.test.ts` |
| `waterwayContextService` | Lock extract, delay math, Elbe/Havelberg | `waterwayContextService.test.ts` |
| `mixedDayRouteService` | Waterway leg + context | Mock `routeWaterwayLeg`; `mixedDayRouteService.waterwayContext.test.ts` |
| `rowing-planner` | Graph routing | `rowingPlanner.test.ts` |
| `gearShuttleRouteService` | Segments when ≥2 geocoded accommodations | OSRM mocked |
| `useRouteCalculation` | Mixed + shuttle pills | Integration hook tests |
| MCP trip tools | `default_route_leg_kind` fields | `tools-trips.test.ts` |

Root `npm test` must include `rowing-planner` workspace after workspace integration.

## Out of Scope

- Tidal tables, BSH providers, suggested departure windows, current-speed flow adjustment.
- Lock annotations on failed waterway (fallback) routes.
- Per-trip rowing speed in trip form UI.
- `dev.sh` in the rowing PR.
- Server-rendered localized leg text as primary UX.
- Navigation-grade authority data.

## Further Notes

### Grill-me decisions (locked)

| Topic | Decision |
|-------|----------|
| Migrations | B — restore 129–130, append **one** rowing migration |
| `dev.sh` | A — drop from rowing PR; keep on `feature/TM/rowing_dev` |
| i18n | A — all locales + map via `useTranslation` |
| Lock delay | A — `TREK_LOCK_DELAY_MIN` default, trip column overrides |
| Rowing speed | D — env default now; trip form UI follow-up |
| `rowing-planner` | A — root workspace; keep extractable API |
| Tidal planning | D — remove from v1 PR |
| Locks on fallback | D — defer; document “none on fallback” in wiki |
| Gear shuttle UI | B — map pills for shuttle legs |
| Route DTO break | B — accepted; document in PR |
| Leg label i18n | Structured payload + client `t()` (aligns with i18n A; Q11 not explicitly answered) |

### Suggested implementation order

1. Fix migrations (rebase + restore + append).
2. Remove tidal/BSH code paths and DB columns from branch.
3. Wire `TREK_LOCK_DELAY_MIN` / env speed precedence.
4. Structured leg API + client pill formatting + full i18n.
5. Gear shuttle pills + geocoded-accommodation guard.
6. Workspace/lockfile cleanup for `rowing-planner`.
7. Revert `dev.sh` from branch.
8. Wiki alignment pass.
9. Full test run + Discord pitch before upstream PR.
