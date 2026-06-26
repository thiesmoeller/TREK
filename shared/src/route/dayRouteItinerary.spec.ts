import {
  buildDayRouteItinerary,
  effectiveRouteMode,
  legRouteModeForRun,
} from './dayRouteItinerary';

import { describe, it, expect } from 'vitest';

const days = [
  { id: 1, day_number: 1, date: '2025-06-01' },
  { id: 2, day_number: 2, date: '2025-06-02' },
  { id: 3, day_number: 3, date: '2025-06-03' },
];

function place(
  id: number,
  order: number,
  lat: number,
  lng: number,
  route_mode_override?: string | null,
) {
  return {
    id,
    order_index: order,
    route_mode_override: route_mode_override ?? null,
    place: { lat, lng, place_time: null },
  };
}

describe('buildDayRouteItinerary', () => {
  it('builds a single run for consecutive places without transports', () => {
    const result = buildDayRouteItinerary({
      dayId: 1,
      days,
      assignments: [place(1, 0, 48.1, 11.5), place(2, 1, 48.2, 11.6)],
      reservations: [],
    });
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]?.waypoints).toHaveLength(2);
    expect(result.straightSegments).toEqual([
      [
        [48.1, 11.5],
        [48.2, 11.6],
      ],
    ]);
  });

  it('splits runs at a single-day transport inserted by time', () => {
    const result = buildDayRouteItinerary({
      dayId: 1,
      days,
      assignments: [
        place(1, 0, 48.1, 11.5),
        {
          ...place(2, 1, 48.3, 11.7),
          place: { lat: 48.3, lng: 11.7, place_time: '14:00' },
        },
      ],
      reservations: [
        {
          id: 10,
          type: 'train',
          day_id: 1,
          end_day_id: 1,
          reservation_time: '10:00',
          endpoints: [
            { role: 'from', lat: 50.1, lng: 8.6 },
            { role: 'to', lat: 52.5, lng: 13.4 },
          ],
        },
      ],
    });
    expect(result.runs).toHaveLength(0);
    expect(result.straightSegments).toEqual([
      [
        [48.1, 11.5],
        [50.1, 8.6],
      ],
      [
        [52.5, 13.4],
        [48.3, 11.7],
      ],
    ]);
  });

  it('anchors multi-day transport endpoints on start and end days only', () => {
    const pickup = { role: 'from', lat: 48.1, lng: 11.5 };
    const dropoff = { role: 'to', lat: 52.5, lng: 13.4 };
    const rental = {
      id: 20,
      type: 'car',
      day_id: 1,
      end_day_id: 3,
      day_positions: { 1: 2, 3: -0.5 },
      endpoints: [pickup, dropoff],
    };

    const startDay = buildDayRouteItinerary({
      dayId: 1,
      days,
      assignments: [place(1, 0, 47.0, 10.0), place(2, 1, 47.5, 10.5)],
      reservations: [rental],
    });
    expect(startDay.straightSegments).toEqual([
      [
        [47.0, 10.0],
        [47.5, 10.5],
        [48.1, 11.5],
      ],
    ]);

    const middleDay = buildDayRouteItinerary({
      dayId: 2,
      days,
      assignments: [place(3, 0, 49.0, 12.0), place(4, 1, 49.5, 12.5)],
      reservations: [rental],
    });
    expect(middleDay.runs).toHaveLength(1);
    expect(middleDay.straightSegments).toEqual([
      [
        [49.0, 12.0],
        [49.5, 12.5],
      ],
    ]);

    const endDay = buildDayRouteItinerary({
      dayId: 3,
      days,
      assignments: [place(5, 0, 51.0, 13.0), place(6, 1, 51.5, 13.5)],
      reservations: [rental],
    });
    expect(endDay.straightSegments).toEqual([
      [
        [52.5, 13.4],
        [51.0, 13.0],
        [51.5, 13.5],
      ],
    ]);
  });

  it('excludes assignment-linked transports from route breakpoints', () => {
    const result = buildDayRouteItinerary({
      dayId: 1,
      days,
      assignments: [place(1, 0, 48.1, 11.5), place(2, 1, 48.2, 11.6)],
      reservations: [
        {
          id: 30,
          type: 'bus',
          day_id: 1,
          end_day_id: 1,
          assignment_id: 1,
          day_positions: { 1: 0.5 },
          endpoints: [
            { role: 'from', lat: 50.0, lng: 8.0 },
            { role: 'to', lat: 51.0, lng: 9.0 },
          ],
        },
      ],
    });
    expect(result.runs).toHaveLength(1);
    expect(result.straightSegments).toEqual([
      [
        [48.1, 11.5],
        [48.2, 11.6],
      ],
    ]);
  });
});

describe('effectiveRouteMode', () => {
  it('uses assignment override, then trip default, then walking', () => {
    expect(effectiveRouteMode('waterway', 'walking')).toBe('waterway');
    expect(effectiveRouteMode(null, 'driving')).toBe('driving');
    expect(effectiveRouteMode('inherit', 'waterway')).toBe('waterway');
    expect(effectiveRouteMode(null, null)).toBe('walking');
  });
});

describe('legRouteModeForRun', () => {
  it('applies per-segment override on the leg origin assignment', () => {
    const run = {
      waypoints: [
        { assignmentId: 1, lat: 0, lng: 0, routeModeOverride: 'waterway' },
        { assignmentId: 2, lat: 1, lng: 1, routeModeOverride: null },
        { assignmentId: 3, lat: 2, lng: 2, routeModeOverride: 'driving' },
      ],
    };
    expect(legRouteModeForRun(run, 0, 'walking')).toBe('waterway');
    expect(legRouteModeForRun(run, 1, 'walking')).toBe('walking');
    expect(legRouteModeForRun(run, 2, 'walking')).toBe('driving');
  });
});
