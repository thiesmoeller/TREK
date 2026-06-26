# Route Optimization

TREK calculates route segments between consecutive day-plan places and can reorder ordinary land days to minimize total travel distance.

<!-- TODO: screenshot: optimized route displayed on map -->

![Route Optimization](assets/OptimizeRoute.png)

## Route calculation

TREK uses the selected route mode for each segment between consecutive places in the selected day. The trip default is set on the trip form; an individual stop can override the route from that stop to the next stop in the place inspector.

Supported route modes are **Walking**, **Driving**, and **Waterway**. Walking and driving use **OSRM** (Open Source Routing Machine). Waterway routes use OpenStreetMap waterway data where available.

Waterway routing is a planning aid, not navigation-grade guidance. If a graph route cannot be calculated, TREK draws a straight approximate segment, marks it as approximate, and estimates duration from the trip waterway speed, `TREK_WATERWAY_SPEED_KMH`, or the server fallback.

Route segments reset at any transport reservation (flight, train, car, bus, or cruise) between two places — that leg is not driven or walked, so no ground route is drawn across it.

## Route display

- Colored line segments connect consecutive places on the map.
- At zoom level 12 or higher, time pills show the estimated walking and driving time between each pair of consecutive places.
- When at least two places are on the selected day, total distance and duration are shown in the sidebar footer.

## Optimize route

The **Optimize** button in the sidebar footer reorders places in the current day to minimize total travel distance using a **nearest-neighbor algorithm**. It starts from the first place, then repeatedly visits the closest unvisited place by straight-line (Euclidean) distance.

Only unlocked places are reordered — locked places stay in their current positions.

Optimize is disabled when the selected day has an effective waterway segment. Straight-line nearest-neighbor ordering is misleading for waterways because navigable distance and access points can differ substantially from geographic distance.

The reorder can be undone immediately using the undo action that appears after it is applied.

Route modes v1 does not include locks, tides, support routes, split-group days, or activity profiles.

## Route calculation on/off

Route calculation (segment time pills) can be toggled on or off per user in **Settings → Display**. When disabled, no OSRM requests are made and time pills are not shown.

## Export day to Google Maps

The **Open in Google Maps** button (icon next to Optimize) generates a `https://www.google.com/maps/dir/lat,lng/lat,lng/…` URL containing all places in order and opens it in a new tab.

> **Admin:** Route calculation can be disabled instance-wide via the admin settings.

**See also:** [Day-Plans-and-Notes](Day-Plans-and-Notes) · [Map-Features](Map-Features) · [Display-Settings](Display-Settings)
