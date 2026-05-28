# Rowing Trips and Luggage Bus Planning

TREK can plan a rowing itinerary on waterways while also showing the parallel luggage or support-bus route between overnight stops. Use the rowing plan for the crew's day-by-day route, and use accommodations to define where the luggage bus needs to drive.

This workflow is useful for club tours, multi-day river trips, training camps, and trips where the crew changes location by boat while bags, spare parts, trailers, or a support team move by road.

## Planning model

A rowing trip has two connected plans:

| Plan | TREK feature | What it represents |
|---|---|---|
| Rowing route | Day places with route mode **Row by waterway** | The route rowers take between launch points, locks, landings, lunch stops, and destinations |
| Luggage bus route | Accommodations linked to places | The road route for baggage, support vehicles, or shuttle drivers between overnight stops |

The two plans share the same trip days, places, map, files, notes, packing lists, and collaboration tools. They stay separate on the map so a road transfer does not interrupt the rowing route.

## Create the trip

1. Open **My Trips** and create a new trip.
2. Enter the tour name, start date, and end date.
3. Set the default route mode to **Row on waterways** if most legs are rowing legs.
4. Save the trip and open the planner.

The default route mode controls how TREK draws route legs between consecutive places in day plans. For rowing tours, **Row on waterways** uses the OpenStreetMap waterway graph when route calculation is enabled.

If only part of the trip is rowed, keep the default as **Walking** or **Driving** and override individual place-to-place legs to **Row by waterway** from the place inspector.

## Build the rowing day plan

Create places for every operational stop the rowing crew needs to see:

- Boat house, launch ramp, marina, landing stage, beach, or dock.
- Locks, portage points, bridges, or known obstacles.
- Lunch stops, water refill points, and rest stops.
- Daily finish points and emergency exit points.
- Optional sightseeing stops that the crew will pass on the water.

Assign those places to the correct days in the **Day Plan** sidebar. Put them in the real rowing order for the day.

For each day:

1. Add the start or launch point as the first place.
2. Add intermediate rowing checkpoints in order.
3. Add the finish or landing point as the last place.
4. Add day notes for lock times, portages, tide windows, hazards, meeting times, and local rules.
5. Use the place inspector to override a leg if one segment should be walking or driving instead of rowing.

When route calculation is enabled in **Settings -> Map**, waterway route labels show distance and estimated rowing time. The rowing estimate uses the configured average rowing speed on the server, then adds automatically detected lock delay where TREK finds locks near the routed waterway line.

## Locks and rowing time (v1)

For rowing legs on a **successfully routed** waterway graph, TREK adds lock context:

- Locks are detected from OpenStreetMap tags such as `waterway=lock_gate`, `lock=yes`, and `water=lock`.
- Each detected lock is shown as a route annotation on the map, not as a day-plan place.
- Default lock delay: **`TREK_LOCK_DELAY_MIN`** (server env, default 15 minutes per lock), overridable per trip via **`rowing_lock_delay_min`**.
- Rowing speed: trip default **6 km/h** in the database; server fallback **`TREK_ROWING_KMH`** when the trip value is unset.
- Lock names, refs, opening hours, phone, website, and VHF tags are displayed when OpenStreetMap provides them.
- Opening hours are informational only; TREK does not compute exact lock schedule windows.

**Not in v1:** tidal tables, BSH departure windows, hydrology/current flow adjustment, or lock annotations on straight-line fallback legs.

## Handle waterway route gaps

Waterway routing depends on OpenStreetMap waterway data. If a route cannot be found, TREK falls back to a straight line between the two places and labels it as a fallback.

When that happens:

- **No lock annotations** are shown on fallback legs (only on graph-routed waterway legs).
- Check that both places are placed directly on or near the navigable waterway.
- Add an intermediate point near the missing junction, lock, canal branch, or river bend.
- Split long river sections into shorter legs.
- Use day notes for any manually verified section that the map cannot route.
- Override short land transfers to **Walking** or **Driving** instead of forcing a waterway leg.

For safety-critical navigation, use TREK as the trip-planning overview and verify the route with current charts, local waterway notices, club guidance, lock schedules, weather, and authority rules.

## Plan the luggage bus route

The luggage bus route is generated from accommodations, not from every rowing stop. This keeps the support route focused on where bags or support vehicles actually need to go.

Create one accommodation for each overnight base:

1. Add or search the hotel, campsite, hostel, club house, or group lodging as a place.
2. Open **Reservations** and add a **Hotel** booking, or open the **Day Detail** panel and add an accommodation.
3. Link the accommodation to the place.
4. Set the **From** and **To** days for that stay.
5. Add check-in/check-out times, confirmation codes, and notes for the driver.

TREK connects successive **geocoded** accommodations by road and displays those segments as the gear or luggage shuttle route on the trip map (orange line with distance/duration pills). The client only requests this route when **at least two** accommodations have place coordinates. Accommodations without coordinates are ignored for the shuttle line.

## Recommended structure for each rowing day

Use a consistent pattern so rowers and support drivers can read the plan quickly.

| Day item | Use for |
|---|---|
| First place | Launch or start point for the rowing crew |
| Intermediate places | Locks, hazards, rest stops, checkpoints, lunch, portages |
| Last place | Landing point or destination for the rowing crew |
| Accommodation | Overnight location for luggage and crew |
| Day notes | Driver handoff times, equipment notes, weather calls, lock procedures |
| Transport booking | Planned non-rowing transfers, replacement bus rides, trailer moves, or passenger shuttles |

If the daily landing point and accommodation are not the same location, add both:

- The landing point belongs in the day plan as the rowers' finish.
- The accommodation belongs in the accommodation record so the luggage bus route follows the overnight stop.
- Add a bus, car, or note item for the crew transfer between landing and lodging if needed.

## Example: three-day river tour

| Day | Rowing day plan | Accommodation / luggage bus |
|---|---|---|
| Day 1 | Club dock -> Lock A -> Riverside lunch -> Town landing | Hotel Town |
| Day 2 | Town landing -> Canal junction -> Lock B -> Village landing | Campground Village |
| Day 3 | Village landing -> Nature reserve checkpoint -> Final club dock | No next overnight stop needed |

The rowing route follows the water between all day-plan places. The luggage bus route drives from Hotel Town to Campground Village because those are the consecutive accommodations.

## Packing for rowers and support crew

Use **Lists -> Packing** to separate boat gear, personal luggage, and support-vehicle equipment.

Suggested categories:

- **Boat gear**: oars, spare oarlock, bailer, bow number, lights, boat cover, pump.
- **Safety**: life jackets, throw line, first aid kit, emergency blanket, whistle, repair tape.
- **Navigation**: waterproof phone case, paper chart, lock list, power bank, VHF/radio where required.
- **Crew luggage**: dry bags, change of clothes, towel, toiletries, medication.
- **Bus kit**: driver documents, parking cash/cards, tie-down straps, trailer tools, water canisters, snacks.
- **Documents**: hotel bookings, permits, club emergency contacts, participant list, insurance details.

If bag tracking is enabled, create bags for the luggage bus, boat trailer, safety kit, and each crew member. Assign items to bags so the driver can confirm what should be loaded before departure.

## Collaboration and roles

For larger tours, assign responsibility explicitly:

- Use **Trip Members** to invite rowers, coxes, drivers, and organizers.
- Use **Todos** for tasks such as "Confirm lock opening hours", "Book trailer parking", or "Collect signed waiver".
- Use **Collab Notes** for shared safety briefings and daily weather decisions.
- Use **Collab Chat** for last-minute updates.
- Use **Files** for permits, route PDFs, lodging confirmations, participant lists, and emergency plans.

Drivers usually need the accommodations, daily notes, files, and packing list more than every rowing waypoint. Rowers usually need day-plan places, waterway route labels, weather, notes, and safety files.

## Checklist before departure

- Every rowing day has a start, finish, and enough intermediate points to make the water route readable.
- Route calculation is enabled if you want waterway and luggage-bus lines on the map.
- Each overnight stay is entered as an accommodation linked to a geocoded place.
- The luggage bus route appears between consecutive accommodations.
- Landing points and accommodations are both present when they differ.
- Non-rowing transfers are entered as transport bookings or day notes.
- Weather, hazards, locks, portages, and emergency exits are documented in day notes.
- Packing categories or bags separate boat equipment from luggage-bus cargo.
- Files include permits, bookings, emergency contacts, and route documents.

## Troubleshooting

| Problem | What to check |
|---|---|
| No rowing route appears | Enable route calculation in **Settings -> Map**, check that the day has at least two geocoded places, and confirm the leg mode is **Row by waterway** |
| Rowing route is a straight fallback | Move places closer to the waterway, add intermediate points, or split the leg into shorter sections |
| A road route appears between rowing stops | Check the trip default route mode and per-leg overrides in the place inspector |
| Luggage bus route does not appear | Add at least two accommodations linked to **geocoded** places (lat/lng on the place) |
| No lock icons on fallback rowing line | Expected in v1; add intermediate points or fix routing so the graph route succeeds |
| Bus route uses the wrong stop | The route follows accommodations, not arbitrary day-plan places; check the accommodation place and date range |
| Hotel appears in reservations but not the bus route | Confirm the hotel booking is linked to an accommodation record and a geocoded place |

## Related pages

- [Trip-Planner-Overview](Trip-Planner-Overview)
- [Day-Plans-and-Notes](Day-Plans-and-Notes)
- [Route-Optimization](Route-Optimization)
- [Map-Features](Map-Features)
- [Accommodations](Accommodations)
- [Transport-Flights-Trains-Cars](Transport-Flights-Trains-Cars)
- [Packing-Lists](Packing-Lists)
