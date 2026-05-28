import { describe, expect, it } from 'vitest';
import { extractLocksFromOsmElements, projectPointToPolyline } from '../../../src/services/waterwayContextService';

describe('waterwayContextService', () => {
  const route: [number, number][] = [
    [52.0, 13.0],
    [52.0, 13.1],
    [52.0, 13.2],
  ];

  it('projects points onto a route and returns chainage', () => {
    const p = projectPointToPolyline(52.001, 13.05, route);
    expect(p).not.toBeNull();
    expect(p!.distanceM).toBeLessThan(120);
    expect(p!.chainageM).toBeGreaterThan(3000);
    expect(p!.chainageM).toBeLessThan(4000);
  });

  it('extracts OSM locks, filters by route corridor, dedupes, and orders by chainage', () => {
    const locks = extractLocksFromOsmElements([
      {
        type: 'node',
        id: 1,
        lat: 52.0,
        lon: 13.15,
        tags: { waterway: 'lock_gate', name: 'Second Lock', opening_hours: 'Mo-Fr 08:00-18:00', phone: '+49 1' },
      },
      {
        type: 'node',
        id: 2,
        lat: 52.0,
        lon: 13.05,
        tags: { lock: 'yes', name: 'First Lock', ref: '1' },
      },
      {
        type: 'node',
        id: 3,
        lat: 52.25,
        lon: 13.05,
        tags: { lock: 'yes', name: 'Too Far' },
      },
      {
        type: 'way',
        id: 4,
        center: { lat: 52.00001, lon: 13.05001 },
        tags: { lock: 'yes', name: 'First Lock' },
      },
      {
        type: 'node',
        id: 5,
        lat: 52.0,
        lon: 13.08,
        tags: { amenity: 'cafe', name: 'Not a lock' },
      },
    ], route);

    expect(locks).toHaveLength(2);
    expect(locks.map(l => l.name)).toEqual(['First Lock', 'Second Lock']);
    expect(locks[0].delayS).toBe(15 * 60);
    expect(locks[1].tags.opening_hours).toBe('Mo-Fr 08:00-18:00');
    expect(locks[1].tags.phone).toBe('+49 1');
  });

  it('annotates an Elbe rowing route from Tangermunde to Havelberg with Schleuse Havelberg', () => {
    const tangermuendeToHavelberg: [number, number][] = [
      [52.5448, 11.9769], // Tangermunde on the Elbe
      [52.6264, 11.9457],
      [52.7047, 11.9831],
      [52.7897, 12.0451], // Sandau / lower Elbe approach
      [52.8323, 12.05548], // Schleuse Havelberg, Elbe/Havel connection
      [52.83264, 12.07639], // Havelberg
    ];

    const locks = extractLocksFromOsmElements([
      {
        type: 'node',
        id: 494,
        lat: 52.8323,
        lon: 12.05548,
        tags: {
          lock: 'yes',
          name: 'Schleuse Havelberg',
          waterway: 'lock_gate',
          opening_hours: 'Apr-Sep Mo-Su 08:00-18:00',
          phone: '03385-539830',
          vhf: '21',
        },
      },
    ], tangermuendeToHavelberg);

    expect(locks).toHaveLength(1);
    expect(locks[0].name).toBe('Schleuse Havelberg');
    expect(locks[0].chainageM).toBeGreaterThan(30_000);
    expect(locks[0].lat).toBeCloseTo(52.8323, 4);
    expect(locks[0].lng).toBeCloseTo(12.05548, 4);
    expect(locks[0].delayS).toBe(15 * 60);
    expect(locks[0].tags.vhf).toBe('21');
  });

  it('dedupes Havelberg lock basin and gates into one annotated lock', () => {
    const routeThroughHavelbergLock: [number, number][] = [
      [52.82645785345692, 12.071473685766586],
      [52.8315021, 12.0567565],
      [52.8323395, 12.0555426],
      [52.833147, 12.0543755],
      [52.84, 12.04],
    ];

    const locks = extractLocksFromOsmElements([
      {
        type: 'way',
        id: 452374023,
        center: { lat: 52.8315021, lon: 12.0567565 },
        tags: { 'seamark:type': 'gate', waterway: 'lock_gate' },
      },
      {
        type: 'way',
        id: 4580611,
        center: { lat: 52.8323395, lon: 12.0555426 },
        tags: {
          lock: 'yes',
          lock_name: 'Schleuse Havelberg',
          name: 'Schleuse Havelberg',
          opening_hours: 'Oct-Apr 07:00-17:00; May-Sep Mo-Th 06:00-21:00, Su 08:00-20:00',
          phone: '+49 3385 539830',
          vhf: '21',
          waterway: 'canal',
        },
      },
      {
        type: 'way',
        id: 452374024,
        center: { lat: 52.833147, lon: 12.0543755 },
        tags: { 'seamark:type': 'gate', waterway: 'lock_gate' },
      },
    ], routeThroughHavelbergLock);

    expect(locks).toHaveLength(1);
    expect(locks[0].name).toBe('Schleuse Havelberg');
    expect(locks[0].tags.phone).toBe('+49 3385 539830');
    expect(locks[0].tags.vhf).toBe('21');
    expect(locks[0].delayS).toBe(15 * 60);
  });

  it('dedupes the Geesthacht lock complex into one named lock', () => {
    const routeThroughGeesthachtLock: [number, number][] = [
      [53.42, 10.36],
      [53.4315575, 10.3419723],
      [53.4322462, 10.3383533],
      [53.44, 10.32],
    ];

    const locks = extractLocksFromOsmElements([
      {
        type: 'way',
        id: 23133257,
        center: { lat: 53.4315575, lon: 10.3419723 },
        tags: {
          lock: 'yes',
          loc_name: 'Schleusenkanal',
          name: 'Elbe',
          waterway: 'river',
        },
      },
      {
        type: 'way',
        id: 161941044,
        center: { lat: 53.4322462, lon: 10.3383533 },
        tags: {
          lock: 'yes',
          lock_name: 'Geesthacht Schleuse',
          name: 'Elbe',
          opening_hours: 'Jan 02 06:00-24:00; Dec 27 06:00-24:00',
          phone: '+49 4152 8469140',
          'seamark:name': 'Geesthacht Nordkammer',
          'seamark:type': 'lock_basin',
          vhf: '22',
          waterway: 'river',
        },
      },
      {
        type: 'way',
        id: 161941046,
        center: { lat: 53.4319583, lon: 10.33823 },
        tags: {
          lock: 'yes',
          lock_name: 'Geesthacht Schleuse',
          name: 'Elbe',
          opening_hours: 'Jan 02 06:00-24:00; Dec 27 06:00-24:00',
          phone: '+49 4152 8469140',
          'seamark:name': 'Geesthacht Sudkammer',
          'seamark:type': 'lock_basin',
          vhf: '22',
          waterway: 'river',
        },
      },
    ], routeThroughGeesthachtLock);

    expect(locks).toHaveLength(1);
    expect(locks[0].name).toBe('Geesthacht Schleuse');
    expect(locks[0].tags.phone).toBe('+49 4152 8469140');
    expect(locks[0].tags.vhf).toBe('22');
    expect(locks[0].delayS).toBe(15 * 60);
  });

});
