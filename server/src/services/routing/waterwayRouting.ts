import {
  routeWaterwayLeg as routeWaterwayLegCore,
  type WaterwayLegResult,
  type OverpassClient,
} from '@trek/rowing-planner';
import { fetchOverpassInterpreter } from '../mapsService';

const MAX_SNAP_M = Number(process.env.TREK_WATERWAY_SNAP_M || 2500);
const BBOX_PAD_M = Number(process.env.TREK_WATERWAY_BBOX_PAD_M || 4000);

const overpassClient: OverpassClient = {
  fetchInterpreter: async (query, timeoutSeconds) => fetchOverpassInterpreter(query, timeoutSeconds),
};

export type { WaterwayLegResult };

export async function routeWaterwayLeg(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  legKey: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<WaterwayLegResult> {
  return routeWaterwayLegCore(
    { lat: fromLat, lng: fromLng },
    { lat: toLat, lng: toLng },
    {
      overpassClient,
      legKey,
      signal,
      snapMaxM: MAX_SNAP_M,
      bboxPadM: BBOX_PAD_M,
    },
  );
}
