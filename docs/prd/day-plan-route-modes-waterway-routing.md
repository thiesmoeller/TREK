# PRD: Day-plan route modes and waterway routing

Status: draft (local). Target branch: `feature/waterways` -> `dev`.
Source: code review vs `dev`, grill-with-docs decisions (2026-06-19).

---

## Problem Statement

TREK currently treats day-plan routing mostly as walking/driving between ordered places, with transport bookings handled as separate timeline items. This makes it hard to plan trips where the route between ordinary day-plan stops uses another mode, such as cycling or navigable waterways, without misrepresenting that movement as a flight/train/car-style booking.

Waterway trips should fit TREK's route architecture as a day-plan route mode, not as a special transport type. Rowing, boating, canoeing, and kayaking are documentation examples of waterway usage, not separate core concepts. The first upstream PR should therefore generalize route modes and add waterway routing with a narrow, reviewable scope.

## Solution

Ship a focused **route modes v1** feature:

1. Add a generic day-plan route-mode model with trip default and per-segment override.
2. Add `waterway` as an activity-neutral route mode for navigable waterways.
3. Keep walking/driving behavior compatible, and expose cycling only if it falls out naturally from the same route-mode plumbing.
4. Move mixed route calculation to the server so provider selection, route-mode precedence, fallback semantics, and waterway speed defaults live in one place.
5. Return structured route segments to the client; the client renders geometry and localized labels.
6. Use approximate straight-line fallback when route calculation fails, clearly labelled as approximate.
7. Disable route optimization for waterway-effective days and document why.

## User Stories

1. As a trip organizer, I want a trip-level default route mode, so that most day-plan legs use the expected mode without repeated setup.
2. As an organizer, I want to set the trip default to `waterway`, so that a water-based vacation routes between stops on navigable waterways.
3. As an organizer, I want to override one route segment to walking, driving, or cycling, so that land access before or after a waterway segment is represented correctly.
4. As a user, I want route mode overrides to apply to the route from the selected stop to the next stop, so that the UI matches the segment being changed.
5. As a waterway trip planner, I want waterway distance and duration, so that day distances are visible in the normal route UI.
6. As an organizer, I want a trip-level waterway speed, so that duration estimates match the crew or craft without per-leg editing.
7. As a user, I want failed waterway routing to fall back to an approximate labelled line, so that the map remains useful without implying navigable precision.
8. As a maintainer, I want route calculation rules on the server, so that mixed-mode routing is tested and provider details stay out of the client.
9. As a maintainer, I want all new UI text localized through existing i18n patterns.
10. As a maintainer, I want route-mode fields defined in the base schema, so that fresh databases get the model without incremental migration steps.
11. As a maintainer, I want waterway terminology in schema, APIs, config, package names, and PR wording, so that rowing is not hard-coded as the domain model.

## Implementation Decisions

### Upstream alignment

- Prefer existing TREK names, API shapes, and UI concepts over new terminology.
- Keep `RouteSegment` / route segment language where TREK already uses it.
- Preserve current transport behavior in route calculation unless the route-mode feature requires a focused change.
- Avoid introducing parallel concepts for day plans, transports, reservations, participants, or map overlays.

### Domain language

- Use **day-plan route mode** for how TREK calculates a path between consecutive itinerary places.
- Use **transport** only for booked/scheduled travel items such as flights, trains, car rentals, cruises, ferries, buses, or taxis.
- Use **waterway** as the canonical route-mode name. Rowing, boating, canoeing, and kayaking can appear in examples or docs, but not in persisted field names, API contracts, package names, config names, or generic UI controls.

### Schema

- Add route-mode columns to `server/src/db/schema.ts` for fresh database creation. No incremental migration is required while the feature is unreleased.
- Add trip-level fields:
  - `default_route_mode` for the trip's route-mode default. Existing and new trips default to `walking`.
  - Nullable `waterway_speed_kmh` for duration estimation. `NULL` uses server fallback.
- Add assignment-level field:
  - Nullable `route_mode_override` with supported route modes. `NULL` means inherit the trip default.
- Store per-segment overrides on the starting assignment. The override controls the route segment from that assignment's place to the next assignment's place.
- Do not add day-level route-mode defaults in v1.
- Do not add lock, tide, support-route, or split-group schema in v1.

### Route modes

Initial supported modes:

- `walking`
- `driving`
- `waterway`

Optional if trivial through existing OSRM bike plumbing:

- `cycling`

Effective mode precedence:

```
assignment.route_mode_override ?? trip.default_route_mode ?? 'walking'
```

### Server route calculation

- Add `GET /api/trips/:tripId/days/:dayId/route` as the server-owned route calculation path for selected-day mixed route segments.
- The server resolves effective route mode per segment.
- Preserve current `dev` transport behavior: transport endpoints may split or anchor route runs, but transports remain bookings and do not become route modes.
- Road-like modes use existing OSRM-style routing adapters.
- Waterway mode uses a waterway routing adapter/package.
- The server returns the existing route result shape as closely as possible, with additive route-mode fields:
  - `coordinates`
  - `distance`
  - `duration`
  - `segments` / `RouteSegment[]` compatible with current client usage
  - `routeMode` per segment, matching client-facing casing
  - `isApproximate` fallback marker per segment when needed, matching client-facing casing
  - enough structured metadata for localized client labels
- The client must not depend on server-generated English route strings.
- Database columns remain snake_case; client-facing route DTO additions follow the existing route type casing.

### Waterway routing

- Waterway routing should calculate geometry along navigable waterways where possible.
- Duration uses trip-level `waterway_speed_kmh`, falling back to `TREK_WATERWAY_SPEED_KMH`, then a documented planning default such as 6 km/h.
- When waterway graph routing fails, return an approximate straight-line fallback and mark it clearly.
- Do not claim navigation-grade authority.

### Client

- Trip form exposes trip default route mode and waterway speed if the UI remains small enough for v1.
- Place/assignment inspector exposes route-mode override for the segment from this stop to the next.
- Map and sidebar consume structured route segments from the server.
- Route labels are composed in the client through i18n.
- Disable or hide Optimize when the selected day has effective waterway legs; document that geographic nearest-neighbor order is not reliable for waterways.

### Documentation

- Update route documentation around day-plan route modes.
- Document waterway routing as an approximate planning feature, not navigation authority.
- Document approximate fallback behavior.
- Document why optimization is disabled for waterway-effective days.
- Use rowing, boating, canoeing, or kayaking only as example workflows without naming the architecture after any one activity.

## Explicitly Out of Scope

- Lock detection, lock delays, lock popups, or lock annotations.
- Tides, BSH providers, currents, suggested departure windows, or hydrology.
- Luggage bus, tour bus, support route, gear shuttle, or accommodation-derived driving overlays.
- Split-group day planning.
- Per-day route-mode defaults.
- Per-segment waterway speed.
- Activity profiles such as rowing/kayak/canoe with typical speeds.
- Waterway-specific place categories such as launch, landing, marina, or lock.
- `dev.sh` or local tooling changes.
- Opening upstream issues or PRs without explicit maintainer approval.

## Testing Decisions

Tests should assert observable route behavior rather than provider internals.

| Area | What to verify |
|------|----------------|
| Route-mode precedence | Trip default, assignment override, inherit fallback |
| Assignment override semantics | Starting assignment controls the leg to the next stop |
| Server route endpoint | Mixed modes produce structured route segments |
| Waterway route | Successful waterway route returns geometry, distance, duration |
| Approximate fallback | Failed waterway route returns labelled approximate geometry |
| Client formatting | Labels are localized from structured fields |
| Optimization guard | Waterway-effective days do not run misleading optimization |
| Schema/API | New fields are persisted through existing trip/assignment flows |

Root test coverage should include the route-mode service, waterway routing package/adapter, API contract, and client route rendering/formatting path.

## Implementation Order

1. Rename current branch concepts from rowing-specific to waterway/route-mode terminology.
2. Remove locks, tides/BSH, gear shuttle/support-route code, and related docs from v1.
3. Add route-mode columns to `schema.ts` for fresh installs.
4. Add server route-mode precedence and selected-day mixed route endpoint.
5. Wire walking/driving through server route calculation.
6. Add waterway routing adapter/package and approximate fallback.
7. Wire client rendering, route labels, trip default, and assignment override.
8. Disable/document optimization for waterway-effective days.
9. Add focused tests and update wiki docs.
10. Remove unrelated local tooling changes before upstream PR.
