# PRD: Waterway architecture alignment and PR readiness

Status: local, ready-for-agent.
Target branch: `feature/waterways` -> `dev`.
Source: post-rebase architecture review against `origin/dev` on 2026-06-26.

## Problem Statement

The `feature/waterways` branch is directionally aligned with TREK's route-mode strategy, but it is not yet clean enough for an upstream PR. The branch now has the right core concepts: day-plan route modes, server-owned mixed route calculation, structured route legs, a shared day-route itinerary module, and a dedicated waterway-routing package. However, the rebase review found a few alignment and readiness gaps that would make the branch harder to review, test, or maintain upstream.

From a maintainer's perspective, the most important problem is that the intended architecture is not enforced consistently enough. Route calculation is documented as server-owned, but some provider calls still happen in the client. Accommodation bookend route overlays were preserved during the rebase only in the client straight-line preview, so successful server geometry can drop hotel-to-first-stop and last-stop-to-hotel overlays. The new waterway package also exposes a workspace lifecycle problem: server tests and builds can fail from a clean workspace unless the package is built first.

From a reviewer’s perspective, unrelated local tooling and verification artifacts are still mixed into the route-mode branch, even though the route-mode PRD explicitly marks local tooling changes as out of scope. This makes the upstream story less focused and makes it harder to tell which changes belong to the waterway route-mode feature.

## Solution

Prepare the branch for an upstreamable route-modes PR by tightening the architectural seams and removing scope noise.

The branch should keep the existing strategic direction:

1. Day-plan route mode remains the domain concept.
2. Waterway remains an activity-neutral route mode, not a transport type.
3. The shared route itinerary module remains the canonical way to turn days, assignments, and transports into route runs.
4. The server remains the owner of provider selection, effective route-mode resolution, route geometry, structured route legs, and approximate fallback semantics.
5. The client renders route geometry and localized labels from structured route data.

The cleanup should make those decisions true in code and in the workspace lifecycle:

1. Make `@trek/waterway-routing` consumable by server tests/builds without a manual prebuild.
2. Decide and implement the correct home for accommodation bookend route geometry.
3. Either remove client-side provider fallbacks from route-mode flows or explicitly mark them as legacy compatibility outside the mixed-route architecture.
4. Propagate route abort signals all the way through waterway Overpass requests.
5. Remove or split local tooling and agent/Cursor artifacts from the intended upstream PR.

## User Stories

1. As a TREK maintainer, I want the waterway branch to have a focused upstream PR scope, so that I can review route-mode behavior without unrelated local tooling noise.
2. As a TREK maintainer, I want route calculation to have one clear owner, so that provider selection and fallback behavior do not drift between client and server.
3. As a TREK maintainer, I want the waterway routing package to work in clean test environments, so that CI and local verification do not depend on hidden build order.
4. As a TREK maintainer, I want the root build script to build workspace dependencies in dependency order, so that production builds cannot miss the waterway package.
5. As a TREK maintainer, I want the root test script to prepare or resolve workspace packages consistently, so that server tests can import the waterway-routing interface.
6. As a route-mode implementer, I want the shared day-route itinerary module to stay the canonical itinerary seam, so that client and server do not duplicate transport splitting rules.
7. As a route-mode implementer, I want accommodation bookend routing to have a deliberate owner, so that hotel route overlays do not disappear when server geometry succeeds.
8. As a trip planner, I want hotel-to-first-stop and last-stop-to-hotel route overlays to remain visible when route calculation is enabled, so that the map matches the sidebar's accommodation-aware trip plan.
9. As a trip planner, I want route labels to stay localized on the client, so that server responses do not leak English strings into multilingual UI.
10. As a waterway trip planner, I want approximate fallback lines to remain clearly labelled, so that I do not mistake a straight-line fallback for navigable waterway guidance.
11. As a waterway trip planner, I want the route endpoint to return consistent geometry and structured legs even when one provider fails, so that the map remains useful.
12. As a user switching days quickly, I want old route requests to abort cleanly, so that stale waterway or OSRM responses do not overwrite newer route state.
13. As an operator, I want route timeout behavior to cancel external Overpass calls, so that a timed-out route request does not keep consuming network resources.
14. As a client maintainer, I want the route hook to consume a stable route interface, so that map rendering does not need to know provider details.
15. As a client maintainer, I want sidebar route connectors to reuse structured server route legs wherever possible, so that sidebar and map route labels agree.
16. As a client maintainer, I want any remaining client-side OSRM calls to be clearly scoped as legacy/manual route behavior, so that they are not confused with mixed route-mode calculation.
17. As a reviewer, I want local development scripts to be excluded or separated from the waterway PR, so that route-mode changes can be reviewed independently.
18. As a reviewer, I want generated verification files and agent artifacts removed from the upstream branch, so that the diff contains only product, test, docs, and package changes.
19. As a reviewer, I want route-mode tests to cover observable behavior at high seams, so that implementation can change without rewriting brittle tests.
20. As a maintainer, I want the ADR and PRD to continue matching code, so that future route-mode work can trust the documented architecture.
21. As a maintainer, I want waterway terminology preserved throughout schema, APIs, package names, config, docs, and generic UI, so that rowing remains only an example use case.
22. As a maintainer, I want transport bookings to remain distinct from day-plan route modes, so that flights, trains, cars, ferries, and cruises do not become route-mode overrides.
23. As a maintainer, I want optimization to stay disabled for waterway-effective days, so that geographic nearest-neighbor ordering does not imply navigable waterway order.
24. As a maintainer, I want the package seam around waterway routing to be deep and stable, so that routing mechanics can evolve without affecting server route calculation callers.
25. As a maintainer, I want the server route endpoint to stay the main verification seam, so that mixed-mode route behavior is tested through the same interface the client uses.

## Implementation Decisions

- Keep the existing domain model from the route-modes PRD: day-plan route mode, route mode override, route calculation, approximate route, waterway route mode, waterway speed, and transport.
- Keep server-owned route calculation as the architectural decision. The client should render geometry and labels; it should not own mixed-mode provider selection.
- Keep the shared day-route itinerary module as the canonical module for turning days, assignments, and transport bookings into route runs and straight preview segments.
- Treat `@trek/waterway-routing` as a real workspace package seam. It should be importable in test/build workflows without relying on a manually generated `dist` directory.
- Update root workspace scripts so `build` and `test` respect the new package dependency order. The waterway package should be built before server code that imports its package entry.
- Prefer one of two acceptable package-resolution strategies:
  - build the waterway package before server tests/builds; or
  - expose a dev/test entry that Vitest can resolve from source while production still consumes built output.
- Do not vendor waterway routing logic into the server just to fix import resolution. The package seam is valuable and should remain.
- Decide where accommodation bookend routing belongs before changing code:
  - If bookend geometry is route calculation, move the necessary accommodation context into the server route endpoint and return bookend geometry/legs from the server.
  - If bookend geometry is a client-only overlay, keep it explicitly separate from server route segments and prevent successful server geometry from replacing it.
- Do not let accommodation bookends live in a half-owned state where the client preview includes them but successful server route geometry drops them.
- Keep approximate fallback semantics on the server for mixed route calculation. When provider routing fails, the response should include structured fallback geometry and `isApproximate`.
- Propagate abort signals through the waterway-routing adapter into Overpass fetches. A request timeout should cancel external network work, not only stop waiting at the route endpoint.
- Keep client-side label formatting from structured route fields. Do not add server-generated display strings as the client contract.
- Review all remaining client-side OSRM calls. Keep them only when they are legacy/manual route tools outside mixed route-mode calculation, or move them behind server-owned route interfaces.
- Remove or split out local tooling changes from the upstream route-mode PR scope. This includes local dev launchers, second-instance quickstart helpers, Cursor attribution verification files, and agent lockfiles unless maintainers explicitly want them in a separate PR.
- Preserve waterway terminology. Rowing, kayaking, canoeing, and boating may remain examples in docs, but not canonical schema/API/config/package names.
- Preserve transport semantics. Transports remain booked timeline items; route modes remain ordinary itinerary-leg calculation choices.
- Keep optimization disabled for waterway-effective days in v1.

## Testing Decisions

- Tests should assert observable behavior at the highest useful seam, not provider internals.
- The primary seam for mixed route calculation should be the server day-route endpoint and the underlying route calculation module it exposes.
- The shared day-route itinerary module should be tested directly because it is the canonical pure module for transport splitting and route-run construction.
- The waterway-routing package should be tested at its public package interface, not by duplicating its internal graph details in server tests.
- Workspace build/test lifecycle should be tested or at least covered by CI commands that start from a clean checkout without a prebuilt waterway `dist` directory.
- Accommodation bookend behavior needs regression coverage. A selected day with accommodations and route calculation enabled should preserve hotel-to-first-stop and last-stop-to-hotel route overlays after server route geometry succeeds.
- Server route tests should verify route-mode precedence: assignment override, then trip default, then walking fallback.
- Server route tests should verify waterway success, provider failure, and approximate fallback metadata.
- Server route tests should verify abort propagation where feasible by using a controllable routing adapter or fetch adapter.
- Client route hook tests should verify that the hook consumes server segments, maps structured legs to localized route labels, and does not drop overlay behavior that the UI promises.
- Sidebar route connector tests should verify that map route segments and sidebar connector labels stay aligned.
- PR-readiness checks should include a diff hygiene check for out-of-scope local tooling artifacts.
- Prior art already exists in the current branch:
  - route hook integration tests for structured route legs and all-days route fetching;
  - shared day-route itinerary tests for transport splitting;
  - server mixed route service tests for waterway and fallback behavior;
  - client planner/sidebar tests for optimization guard and route UI behavior.

## Out of Scope

- Adding lock detection, lock delays, tide data, current data, or hydrology providers.
- Adding waterway-specific place categories such as launch, landing, marina, or lock.
- Adding per-day route-mode defaults.
- Adding per-segment waterway speed.
- Adding activity profiles for rowing, kayaking, canoeing, or boating.
- Adding split-group day planning or support-driver routes.
- Reworking the entire route UI.
- Replacing the existing map rendering stack.
- Adding new external routing providers beyond the current waterway and OSRM-style adapters.
- Publishing upstream issues or PRs without maintainer approval.
- Bundling local tooling cleanup into the upstream route-mode PR unless maintainers explicitly request it.

## Further Notes

- The branch is strategically aligned after rebasing onto `dev`: the route-mode vocabulary, shared itinerary seam, server-owned route calculation direction, structured route legs, client i18n labels, waterway package, and optimization guard all match the intended architecture.
- The remaining work is PR-readiness and seam tightening, not a rethink of the feature.
- The most urgent issue is workspace package lifecycle. If server tests cannot import the waterway package from a clean checkout, reviewers and CI will see failures unrelated to route behavior.
- The second most important issue is accommodation bookend ownership. The current post-rebase behavior risks a user-visible regression when server geometry succeeds.
- The third issue is scope discipline. Local tooling files should be removed from the upstream route-mode PR or split into a separate tooling PR.
