import {
  TRANSPORT_TYPES,
  parseTimeToMinutes,
  getSpanPhase,
  getTransportRouteEndpoints,
  getDisplayTimeForDay,
  expandFlightLegsForDay,
  getTransportForDay,
  getMergedItems as sharedGetMergedItems,
  buildDayRouteItinerary,
  effectiveRouteMode,
  legRouteModeForRun,
  normalizeRouteMode,
  parseRouteModeOverride,
} from '@trek/shared';

import type {
  RouteLegMode,
  DayRouteAssignmentInput,
  DayRouteDayInput,
  DayRouteReservationInput,
  RoutePlaceWaypoint,
  DayRouteRun,
  BuildDayRouteItineraryInput,
  DayRouteItinerary,
} from '@trek/shared';

import type { MergedItem as ClientMergedItem } from '../types';

export {
  TRANSPORT_TYPES,
  parseTimeToMinutes,
  getSpanPhase,
  getTransportRouteEndpoints,
  getDisplayTimeForDay,
  expandFlightLegsForDay,
  getTransportForDay,
  buildDayRouteItinerary,
  effectiveRouteMode,
  legRouteModeForRun,
  normalizeRouteMode,
  parseRouteModeOverride,
};

export type {
  RouteLegMode,
  DayRouteAssignmentInput,
  DayRouteDayInput,
  DayRouteReservationInput,
  RoutePlaceWaypoint,
  DayRouteRun,
  BuildDayRouteItineraryInput,
  DayRouteItinerary,
};

export type MergedItem = ClientMergedItem;

/** Client-facing merge: shared builder returns domain-shaped rows at runtime. */
export function getMergedItems(opts: Parameters<typeof sharedGetMergedItems>[0]): ClientMergedItem[] {
  return sharedGetMergedItems(opts) as ClientMergedItem[];
}
