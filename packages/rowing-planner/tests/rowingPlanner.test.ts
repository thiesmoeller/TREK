import { describe, expect, it } from 'vitest';
import { extractLocksFromOsmElements, routeWaterwayLeg } from '../src';

describe('rowing-planner', () => {
  it('routes a mocked Overpass waterway graph', async () => {
    const elements = [
      { type: 'node', id: 1, lat: 52.0, lon: 13.0 },
      { type: 'node', id: 2, lat: 52.0, lon: 13.1 },
      { type: 'node', id: 3, lat: 52.0, lon: 13.2 },
      { type: 'way', id: 10, nodes: [1, 2, 3], tags: { waterway: 'river' } },
    ];
    const result = await routeWaterwayLeg(
      { lat: 52.0, lng: 13.0 },
      { lat: 52.0, lng: 13.2 },
      { overpassClient: { fetchInterpreter: async () => ({ elements }) }, legKey: 'test' },
    );
    expect(result.coords.length).toBeGreaterThanOrEqual(2);
    expect(result.distanceM).toBeGreaterThan(10_000);
  });

  it('dedupes Havelberg and Geesthacht-style lock complexes', () => {
    const havelberg = extractLocksFromOsmElements([
      { type: 'way', id: 1, center: { lat: 52.8315021, lon: 12.0567565 }, tags: { waterway: 'lock_gate' } },
      { type: 'way', id: 2, center: { lat: 52.8323395, lon: 12.0555426 }, tags: { lock: 'yes', lock_name: 'Schleuse Havelberg', phone: '+49 3385 539830' } },
      { type: 'way', id: 3, center: { lat: 52.833147, lon: 12.0543755 }, tags: { waterway: 'lock_gate' } },
    ], [
      [52.82645785345692, 12.071473685766586],
      [52.8323395, 12.0555426],
      [52.84, 12.04],
    ]);
    expect(havelberg).toHaveLength(1);
    expect(havelberg[0].name).toBe('Schleuse Havelberg');

    const geesthacht = extractLocksFromOsmElements([
      { type: 'way', id: 4, center: { lat: 53.4315575, lon: 10.3419723 }, tags: { lock: 'yes', name: 'Elbe' } },
      { type: 'way', id: 5, center: { lat: 53.4322462, lon: 10.3383533 }, tags: { lock: 'yes', lock_name: 'Geesthacht Schleuse', phone: '+49 4152 8469140' } },
      { type: 'way', id: 6, center: { lat: 53.4319583, lon: 10.33823 }, tags: { lock: 'yes', lock_name: 'Geesthacht Schleuse' } },
    ], [
      [53.42, 10.36],
      [53.4315575, 10.3419723],
      [53.4322462, 10.3383533],
      [53.44, 10.32],
    ]);
    expect(geesthacht).toHaveLength(1);
    expect(geesthacht[0].name).toBe('Geesthacht Schleuse');
  });
});
