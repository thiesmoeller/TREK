# Waterway Route Modes

TREK supports route modes for day-plan legs. A trip can have a default route mode, and each stop can override the route from that stop to the next stop.

Route modes are:

- **Walking**: OSRM foot routing.
- **Driving**: OSRM car routing.
- **Waterway**: OpenStreetMap waterway graph routing for boating, rowing, canoeing, kayaking, or similar water-based travel.

## Trip defaults and leg overrides

When you create or edit a trip, choose the default route mode that applies to most day-plan legs. TREK uses that mode between each stop and the next stop unless the starting stop has an override.

Use the place inspector to override a single leg when a day mixes travel types. For example, a river day can use **Waterway** by default while a portage, taxi transfer, or short walk uses **Walking** or **Driving**.

## Waterway speed

Trips can optionally set a waterway speed in km/h. TREK uses this value for waterway duration estimates. If the trip does not set a speed, the server uses `TREK_WATERWAY_SPEED_KMH`, then falls back to 6 km/h.

The speed is only an estimate for planning labels. It is not a navigation, safety, current, tide, or schedule calculation.

## Approximate waterway routes

Waterway routing depends on OpenStreetMap waterway connectivity. If TREK cannot find a graph route between two stops, it falls back to a straight approximate line and labels the leg as approximate.

When a waterway leg is approximate:

- Move the stops closer to the waterway.
- Add intermediate day-plan stops near junctions, bends, launch points, or landings.
- Split long water sections into shorter legs.
- Use notes for locally verified details that the map cannot route.

For safety-critical navigation, verify the route with current charts, local notices, weather, authority rules, and local guidance.

## Optimization

Day-plan optimization is disabled for days that contain waterway legs. Waterway routes often need a user-chosen order because launch points, landings, currents, portages, and known constraints matter more than shortest map distance.

You can still manually reorder places on a waterway day.

## Not in v1

Waterway route modes in v1 do not include:

- Lock detection, lock delays, or lock opening-hour calculations.
- Tide tables, BSH windows, current, hydrology, or departure-time planning.
- Support-vehicle, luggage-bus, or split-group routes.
- Separate activity profiles for rowing, boating, canoeing, or kayaking.

Use day notes, files, reservations, transport bookings, and packing lists to track those operational details.

## Related pages

- [Day-Plans-and-Notes](Day-Plans-and-Notes)
- [Route-Optimization](Route-Optimization)
- [Map-Features](Map-Features)
- [Transport-Flights-Trains-Cars](Transport-Flights-Trains-Cars)
