import type { RouteLegMode } from './dayRouteItinerary';

/** Structured day-route leg returned by GET /trips/:id/days/:dayId/route — geometry and metadata only. */
export interface DayRouteLeg {
  polylineIndex: number;
  routeMode: RouteLegMode;
  distanceM: number;
  durationS: number;
  isApproximate: boolean;
  mid: [number, number];
  from: [number, number];
  to: [number, number];
}

export interface MixedDayRoute {
  segments: [number, number][][];
  legs: DayRouteLeg[];
}
