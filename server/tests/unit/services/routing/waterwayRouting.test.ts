import { describe, expect, it, vi } from 'vitest';

const { routeWaterwayLegCore, fetchOverpassInterpreter } = vi.hoisted(() => ({
  routeWaterwayLegCore: vi.fn(async (_from, _to, options) => {
    await options.overpassClient.fetchInterpreter('query', 35, { signal: options.signal });
    return { coords: [[52, 13], [52, 13.1]], distanceM: 1000 };
  }),
  fetchOverpassInterpreter: vi.fn(async () => ({ elements: [] })),
}));

vi.mock('@trek/waterway-routing', () => ({
  routeWaterwayLeg: routeWaterwayLegCore,
}));

vi.mock('../../../../src/services/mapsService', () => ({
  fetchOverpassInterpreter,
}));

import { routeWaterwayLeg } from '../../../../src/services/routing/waterwayRouting';

describe('server waterway routing adapter', () => {
  it('passes AbortSignal through to the Overpass interpreter client', async () => {
    const controller = new AbortController();

    await routeWaterwayLeg(52, 13, 52, 13.1, 'leg-1', { signal: controller.signal });

    expect(routeWaterwayLegCore).toHaveBeenCalledWith(
      { lat: 52, lng: 13 },
      { lat: 52, lng: 13.1 },
      expect.objectContaining({ signal: controller.signal }),
    );
    expect(fetchOverpassInterpreter).toHaveBeenCalledWith('query', 35, { signal: controller.signal });
  });
});
