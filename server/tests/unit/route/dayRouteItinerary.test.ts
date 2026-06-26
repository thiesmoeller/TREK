import { describe, it, expect } from 'vitest';
import {
  buildDayRouteItinerary,
  effectiveRouteMode,
  legRouteModeForRun,
} from '@trek/shared';

const days = [
  { id: 1, day_number: 1, date: '2025-06-01' },
  { id: 2, day_number: 2, date: '2025-06-02' },
  { id: 3, day_number: 3, date: '2025-06-03' },
];

function place(id: number, order: number, lat: number, lng: number, route_mode_override?: string | null) {
  return {
    id,
    order_index: order,
    route_mode_override: route_mode_override ?? null,
    place: { lat, lng, place_time: null },
  };
}

describe('buildDayRouteItinerary (server)', () => {
  it('splits runs at transport breakpoints and anchors endpoints', () => {
    const result = buildDayRouteItinerary({
      dayId: 1,
      days,
      assignments: [
        place(1, 0, 48.1, 11.5),
        { ...place(2, 1, 48.3, 11.7), place: { lat: 48.3, lng: 11.7, place_time: '14:00' } },
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
      [[48.1, 11.5], [50.1, 8.6]],
      [[52.5, 13.4], [48.3, 11.7]],
    ]);
  });

  it('respects multi-day span endpoint rules', () => {
    const rental = {
      id: 20,
      type: 'car',
      day_id: 1,
      end_day_id: 3,
      day_positions: { 2: 2 },
      endpoints: [
        { role: 'from', lat: 48.1, lng: 11.5 },
        { role: 'to', lat: 52.5, lng: 13.4 },
      ],
    };
    const middle = buildDayRouteItinerary({
      dayId: 2,
      days,
      assignments: [place(1, 0, 49.0, 12.0), place(2, 1, 49.5, 12.5)],
      reservations: [rental],
    });
    expect(middle.straightSegments).toEqual([[[49.0, 12.0], [49.5, 12.5]]]);
  });

  it('effectiveRouteMode precedence matches assignment → trip → walking', () => {
    expect(effectiveRouteMode('driving', 'waterway')).toBe('driving');
    expect(effectiveRouteMode(null, 'waterway')).toBe('waterway');
    expect(legRouteModeForRun(
      {
        waypoints: [
          { assignmentId: 1, lat: 0, lng: 0, routeModeOverride: 'waterway' },
          { assignmentId: 2, lat: 1, lng: 1, routeModeOverride: null },
        ],
      },
      1,
      'walking',
    )).toBe('walking');
  });
});
