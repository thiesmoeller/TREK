# TREK Trip Planning Context

TREK plans trips as ordered days, places, bookings, and route overlays. This glossary keeps planning language precise so feature work does not confuse itinerary movement with reservations.

## Language

**Day-plan route mode**:
The way TREK calculates the path between two consecutive places in a day's ordered itinerary. A trip defines this with `default_route_mode`, which defaults to walking for existing and newly created trips; an individual leg may override that default. Day-level defaults are not part of the initial model. Walking, driving, cycling, and waterway are valid examples when supported by routing data.
_Avoid_: Transport type, reservation type

**Route calculation**:
The server-owned process that turns a day's ordered itinerary places and effective route modes into structured route segments, geometry, durations, and approximate-route markers. The client renders the result but does not own provider selection or mixed-mode routing rules.
_Avoid_: Client-owned mixed routing

**Route mode override**:
A per-segment choice, stored as nullable `route_mode_override`, that replaces the trip's default day-plan route mode for one connection between consecutive itinerary places. `NULL` means the segment inherits the trip default. The override belongs to the starting itinerary stop and controls the route segment from that stop to the next stop.
_Avoid_: Transport override, place type

**Approximate route**:
A fallback route shown when TREK cannot calculate geometry for the selected day-plan route mode. Approximate routes must be labelled so users do not mistake straight-line geometry for a navigable path.
_Avoid_: Silent fallback

**Waterway route mode**:
A day-plan route mode that calculates paths along navigable waterways between consecutive itinerary places. Rowing is one use case for this mode, but the mode name stays activity-neutral so canoeing, kayaking, or small-craft trips can use the same concept.
_Avoid_: Rowing mode

**Waterway routing**:
The routing capability for calculating waterway route segments. The package/module name should be `waterway-routing` because it owns routing mechanics, not the broader planning workflow.
_Avoid_: Rowing planner, waterway planner

**Waterway optimization**:
Automatic route ordering is not part of the initial waterway route mode. Existing place-order optimization may be misleading for waterways because geographic proximity does not imply navigable waterway proximity.
_Avoid_: Optimizing waterway days with straight-line nearest-neighbor distance

**Waterway terminology**:
Persisted fields, API contracts, configuration names, package names, maintainer-facing architecture, and generic UI controls should use waterway terminology. Rowing, boating, canoeing, or kayaking may appear as documentation examples, but should not be the canonical domain term.
_Avoid_: Rowing as the canonical schema, API, or package name

**Waterway context**:
Optional information discovered near a waterway route segment, such as locks or related OpenStreetMap tags. Waterway context is not part of the initial waterway route mode because source data may not reliably attach lock notation to the routed water geometry.
_Avoid_: Lock place, waterway booking

**Split group day**:
A day where different members of the trip follow different activities or routes during the same time period. TREK does not currently model split group days as first-class parallel itineraries, so derived support routes should stay out of the initial waterway route mode.
_Avoid_: Treating a support route as a hidden transport booking

**Waterway speed**:
A trip-level planning assumption, stored as nullable `waterway_speed_kmh`, for estimating duration on waterway route segments. `NULL` means the server uses the deployment default, such as `TREK_WATERWAY_SPEED_KMH`, and then a documented planning fallback. It is not configured per segment in the initial model; a later activity profile may provide typical defaults.
_Avoid_: Rowing speed when referring to the stored trip setting

**Transport**:
A booked or scheduled travel item such as a flight, train, car rental, cruise, ferry, bus, or taxi. A transport may appear in the day timeline and on the map, but it is not the same thing as the route mode between ordinary day-plan places.
_Avoid_: Route mode

**Example dialogue**:
Planner: "Today we visit the campsite by boat."
Developer: "Then use the waterway route mode between those places, not a transport booking."
Planner: "The support driver also moves bags from hotel A to hotel B."
Developer: "That belongs to future split-group planning, so keep it out of the initial waterway route mode."
