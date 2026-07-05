# Built-in walking/driving day routes

Status: ready-for-agent  
Type: AFK  
Parent: [PRD: Day-plan route modes with plugin route providers](../prd/route-modes-plugin-architecture.md)

## What to build

Deliver a complete **built-in** day-plan routing path (walking and driving only) without any plugin involvement. A trip planner can persist route mode preferences, request a server-calculated mixed day route, and see map polylines and sidebar route legs that match.

End-to-end behavior:

- Trips store `default_route_mode` and assignments store `route_mode_override` (including explicit `inherit` meaning “use trip default”).
- A shared pure **day route itinerary** module splits the day at transport breakpoints and resolves effective mode per leg (override → trip default → walking).
- `GET /trips/:tripId/days/:dayId/route` returns mixed route geometry and structured legs using **OSRM** for walking and driving legs only.
- **Accommodation bookend legs** (hotel → first stop, last stop → hotel) are computed on the server and included in the response — not a client-only overlay.
- The client route hook consumes the server response for map and sidebar; built-in mode labels use core i18n.
- When OSRM fails for a leg, the server returns a straight-line fallback with `isApproximate: true` (day route still succeeds).

Plugin modes, registry, and `/api/route-modes` are out of scope for this slice.

## Acceptance criteria

- [ ] Schema and API support `default_route_mode`, `route_mode_override`, and `inherit` sentinel with correct effective-mode resolution
- [ ] Day route itinerary unit tests cover transport splits, mode precedence, and `inherit` → null
- [ ] Day route endpoint returns OSRM geometry for walking/driving place-to-place legs
- [ ] Day route response includes accommodation bookend legs when a hotel applies to the day
- [ ] Per-leg OSRM failure produces approximate straight-line fallback without failing the whole request
- [ ] Client map and sidebar render server structured legs (no parallel client-side mixed-mode provider selection)
- [ ] Built-in mode labels are localized via core i18n

## Blocked by

None — can start immediately.

## User stories

7, 8, 9, 14, 15, 17, 18, 19, 22, 23, 24, 25, 31, 32
