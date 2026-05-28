import {
  extractLocksFromOsmElements,
  getWaterwayContext,
  haversineMeters,
  projectPointToPolyline,
  routeMidpoint,
  type OverpassClient,
  type RowingSettings,
  type WaterwayContext,
} from '@trek/rowing-planner';
import { fetchOverpassInterpreter } from './mapsService';

export {
  extractLocksFromOsmElements,
  projectPointToPolyline,
};
export type { WaterwayContext, WaterwayLockAnnotation } from '@trek/rowing-planner';

const overpassClient: OverpassClient = {
  fetchInterpreter: async (query, timeoutSeconds) => fetchOverpassInterpreter(query, timeoutSeconds),
};

const DEFAULT_LOCK_DELAY_MIN = Number(process.env.TREK_LOCK_DELAY_MIN ?? 15);

export async function getWaterwayContextForLeg(params: {
  coords: [number, number][];
  from: [number, number];
  to: [number, number];
  distanceM: number;
  baseRowingDurationS?: number;
  rowingSpeedMps?: number;
  settings?: RowingSettings;
}): Promise<WaterwayContext> {
  const settings: RowingSettings = {
    defaultLockDelayMinutes: DEFAULT_LOCK_DELAY_MIN,
    tidalPlanningEnabled: false,
    ...(params.rowingSpeedMps ? { rowingSpeedMps: params.rowingSpeedMps } : {}),
    ...(params.settings ?? {}),
  };
  return getWaterwayContext(
    { coords: params.coords, distanceM: params.distanceM },
    {
      overpassClient,
      waterLevelProviders: [],
      settings,
      lockCorridorM: Number(process.env.TREK_LOCK_CORRIDOR_M ?? 180),
      contextBboxPadM: Number(process.env.TREK_WATERWAY_CONTEXT_BBOX_PAD_M ?? 1000),
    },
  );
}

export { haversineMeters, routeMidpoint };
