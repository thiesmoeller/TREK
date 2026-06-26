import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRouteCalculation } from '../../../src/hooks/useRouteCalculation';
import { TranslationProvider } from '../../../src/i18n/TranslationContext';
import { useSettingsStore } from '../../../src/store/settingsStore';
import { useTripStore } from '../../../src/store/tripStore';
import { tripsApi } from '../../../src/api/client';
import { buildAssignment, buildPlace } from '../../helpers/factories';
import type { TripStoreState } from '../../../src/store/tripStore';
import type { RouteSegment } from '../../../src/types';

vi.mock('../../../src/components/Map/RouteCalculator', async (importActual) => {
  const actual = await importActual<typeof import('../../../src/components/Map/RouteCalculator')>();
  return {
    ...actual,
    calculateSegments: vi.fn(),
    calculateRoute: vi.fn(),
    optimizeRoute: vi.fn((waypoints: unknown[]) => waypoints),
    generateGoogleMapsUrl: vi.fn(),
  };
});

const routeCalculator = await import('../../../src/components/Map/RouteCalculator');
const mockCalculateSegments = vi.mocked(routeCalculator.calculateSegments);

const getDayRouteSpy = vi.spyOn(tripsApi, 'getDayRoute');

const MOCK_SEGMENTS: RouteSegment[] = [
  {
    from: [48.8566, 2.3522],
    to: [51.5074, -0.1278],
    mid: [50.182, 1.1122],
    walkingText: '120 min',
    drivingText: '90 min',
  },
];

function buildMockStore(assignments: Record<string, ReturnType<typeof buildAssignment>[]> = {}): Partial<TripStoreState> {
  useTripStore.setState({ assignments, reservations: [], days: [], trip: { id: 42 } as any });
  return { assignments } as Partial<TripStoreState>;
}

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(TranslationProvider, null, children);
}

describe('useRouteCalculation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({ settings: { route_calculation: false } as any });
    useTripStore.setState({ assignments: {}, trip: { id: 42 } as any } as any);
    (mockCalculateSegments as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SEGMENTS);
    getDayRouteSpy.mockResolvedValue({
      segments: [],
      legs: [],
    } as any);
  });

  it('FE-HOOK-ROUTE-001: with no selectedDayId, route is null', () => {
    const store = buildMockStore({});
    const { result } = renderHook(
      () => useRouteCalculation(store as TripStoreState, null),
      { wrapper },
    );
    expect(result.current.route).toBeNull();
  });

  it('FE-HOOK-ROUTE-002: with < 2 waypoints, route remains null', async () => {
    const place = buildPlace({ lat: 48.8566, lng: 2.3522 });
    const assignment = buildAssignment({ day_id: 5, order_index: 0, place });
    const store = buildMockStore({ '5': [assignment] });

    const { result } = renderHook(
      () => useRouteCalculation(store as TripStoreState, 5),
      { wrapper },
    );

    await act(async () => {});
    expect(result.current.route).toBeNull();
  });

  it('FE-HOOK-ROUTE-003: with ≥ 2 geo-coded assignments, sets route coordinates (straight baseline)', async () => {
    const p1 = buildPlace({ lat: 48.8566, lng: 2.3522 });
    const p2 = buildPlace({ lat: 51.5074, lng: -0.1278 });
    const a1 = buildAssignment({ day_id: 5, order_index: 0, place: p1 });
    const a2 = buildAssignment({ day_id: 5, order_index: 1, place: p2 });
    const store = buildMockStore({ '5': [a1, a2] });

    const { result } = renderHook(
      () => useRouteCalculation(store as TripStoreState, 5),
      { wrapper },
    );

    await act(async () => {});
    expect(result.current.route).toEqual([
      [[p1.lat, p1.lng], [p2.lat, p2.lng]],
    ]);
    expect(getDayRouteSpy).not.toHaveBeenCalled();
  });

  it('FE-HOOK-ROUTE-004: with route_calculation enabled, uses server mixed-route API', async () => {
    useSettingsStore.setState({ settings: { route_calculation: true } as any });

    const p1 = buildPlace({ lat: 48.8566, lng: 2.3522 });
    const p2 = buildPlace({ lat: 51.5074, lng: -0.1278 });
    const a1 = buildAssignment({ day_id: 5, order_index: 0, place: p1 });
    const a2 = buildAssignment({ day_id: 5, order_index: 1, place: p2 });
    const store = buildMockStore({ '5': [a1, a2] });

    getDayRouteSpy.mockResolvedValueOnce({
      segments: [[[p1.lat, p1.lng], [p2.lat, p2.lng]]],
      legs: [{
        polylineIndex: 0,
        mid: MOCK_SEGMENTS[0].mid,
        from: MOCK_SEGMENTS[0].from,
        to: MOCK_SEGMENTS[0].to,
        routeMode: 'walking',
        distanceM: 42_000,
        durationS: 7200,
        isApproximate: false,
      }],
    });

    const { result } = renderHook(
      () => useRouteCalculation(store as TripStoreState, 5),
      { wrapper },
    );

    await act(async () => {});

    expect(getDayRouteSpy).toHaveBeenCalled();
    expect(mockCalculateSegments).not.toHaveBeenCalled();
    expect(result.current.route).toEqual([[[p1.lat, p1.lng], [p2.lat, p2.lng]]]);
    expect(result.current.routeSegments).toEqual([
      expect.objectContaining({
        walkingText: '2 h 0 min',
        drivingText: '2 h 0 min',
        polylineIndex: 0,
        durationS: 7200,
      }),
    ]);
  });

  it('FE-HOOK-ROUTE-004b: formats approximate waterway legs from structured API fields', async () => {
    useSettingsStore.setState({ settings: { route_calculation: true } as any });

    const p1 = buildPlace({ lat: 53.5, lng: 10.0 });
    const p2 = buildPlace({ lat: 53.6, lng: 10.1 });
    const a1 = buildAssignment({ day_id: 5, order_index: 0, place: p1 });
    const a2 = buildAssignment({ day_id: 5, order_index: 1, place: p2 });
    const store = buildMockStore({ '5': [a1, a2] });
    useTripStore.setState({ trip: { id: 42, waterway_speed_kmh: 6 } as any });

    getDayRouteSpy.mockResolvedValueOnce({
      segments: [[[p1.lat, p1.lng], [p2.lat, p2.lng]]],
      legs: [{
        polylineIndex: 0,
        mid: [53.55, 10.05],
        from: [p1.lat!, p1.lng!],
        to: [p2.lat!, p2.lng!],
        routeMode: 'waterway',
        distanceM: 10_000,
        durationS: 6000,
        isApproximate: true,
      }],
    });

    const { result } = renderHook(
      () => useRouteCalculation(store as TripStoreState, 5),
      { wrapper },
    );

    await act(async () => {});

    expect(result.current.routeSegments[0]).toEqual(expect.objectContaining({
      routeMode: 'waterway',
      isApproximate: true,
      waterwayText: expect.stringContaining('approximate'),
    }));
  });

  it('FE-HOOK-ROUTE-005: with route_calculation disabled, does not call geometry API', async () => {
    useSettingsStore.setState({ settings: { route_calculation: false } as any });

    const p1 = buildPlace({ lat: 48.8566, lng: 2.3522 });
    const p2 = buildPlace({ lat: 51.5074, lng: -0.1278 });
    const a1 = buildAssignment({ day_id: 5, order_index: 0, place: p1 });
    const a2 = buildAssignment({ day_id: 5, order_index: 1, place: p2 });
    const store = buildMockStore({ '5': [a1, a2] });

    const { result } = renderHook(
      () => useRouteCalculation(store as TripStoreState, 5),
      { wrapper },
    );

    await act(async () => {});

    expect(getDayRouteSpy).not.toHaveBeenCalled();
    expect(mockCalculateSegments).not.toHaveBeenCalled();
    expect(result.current.routeSegments).toEqual([]);
  });

  it('FE-HOOK-ROUTE-006: assignments sorted by order_index; server replaces polyline geometry', async () => {
    useSettingsStore.setState({ settings: { route_calculation: true } as any });

    const p1 = buildPlace({ lat: 10, lng: 10 });
    const p2 = buildPlace({ lat: 20, lng: 20 });
    const a1 = buildAssignment({ day_id: 5, order_index: 1, place: p1 });
    const a2 = buildAssignment({ day_id: 5, order_index: 0, place: p2 });
    const store = buildMockStore({ '5': [a1, a2] });

    getDayRouteSpy.mockResolvedValueOnce({
      segments: [[[20, 20], [10, 10]]],
      legs: [],
    });

    const { result } = renderHook(
      () => useRouteCalculation(store as TripStoreState, 5),
      { wrapper },
    );

    await act(async () => {});

    expect(result.current.route).toEqual([[[20, 20], [10, 10]]]);
    expect(getDayRouteSpy).toHaveBeenCalledWith(42, 5, expect.any(Object));
  });

  it('FE-HOOK-ROUTE-007: assignments with no lat/lng are filtered out', async () => {
    const pValid = buildPlace({ lat: 48.8566, lng: 2.3522 });
    const pNoGeo = buildPlace({ lat: null as any, lng: null as any });
    const a1 = buildAssignment({ day_id: 5, order_index: 0, place: pNoGeo });
    const a2 = buildAssignment({ day_id: 5, order_index: 1, place: pValid });
    const store = buildMockStore({ '5': [a1, a2] });

    const { result } = renderHook(
      () => useRouteCalculation(store as TripStoreState, 5),
      { wrapper },
    );

    await act(async () => {});
    expect(result.current.route).toBeNull();
    expect(getDayRouteSpy).not.toHaveBeenCalled();
  });

  it('FE-HOOK-ROUTE-008: AbortController.abort() when selectedDayId changes', async () => {
    useSettingsStore.setState({ settings: { route_calculation: true } as any });

    let resolvePost!: (v: unknown) => void;
    getDayRouteSpy.mockImplementationOnce((_tripId: unknown, _dayId: unknown, opts: { signal?: AbortSignal }) =>
      new Promise(resolve => {
        resolvePost = resolve;
        opts?.signal?.addEventListener('abort', () => resolve({ segments: [], legs: [] }));
      }),
    );

    const p1 = buildPlace({ lat: 10, lng: 10 });
    const p2 = buildPlace({ lat: 20, lng: 20 });
    const a1 = buildAssignment({ day_id: 5, order_index: 0, place: p1 });
    const a2 = buildAssignment({ day_id: 5, order_index: 1, place: p2 });

    const store1 = buildMockStore({ '5': [a1, a2], '6': [a1, a2] });

    const { rerender } = renderHook(
      ({ dayId }: { dayId: number }) => useRouteCalculation(store1 as TripStoreState, dayId),
      { initialProps: { dayId: 5 }, wrapper },
    );

    await act(async () => {
      rerender({ dayId: 6 });
    });

    expect(getDayRouteSpy.mock.calls.length).toBeGreaterThanOrEqual(1);

    resolvePost?.({ segments: [], legs: [] });
  });

  it('FE-HOOK-ROUTE-009: AbortError from server route call does not repopulate segments', async () => {
    useSettingsStore.setState({ settings: { route_calculation: true } as any });

    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    getDayRouteSpy.mockRejectedValueOnce(abortError);

    const p1 = buildPlace({ lat: 10, lng: 10 });
    const p2 = buildPlace({ lat: 20, lng: 20 });
    const a1 = buildAssignment({ day_id: 5, order_index: 0, place: p1 });
    const a2 = buildAssignment({ day_id: 5, order_index: 1, place: p2 });
    const store = buildMockStore({ '5': [a1, a2] });

    const { result } = renderHook(
      () => useRouteCalculation(store as TripStoreState, 5),
      { wrapper },
    );

    await act(async () => {});
    expect(result.current.routeSegments).toEqual([]);
    expect(getDayRouteSpy).toHaveBeenCalled();
    expect(mockCalculateSegments).not.toHaveBeenCalled();
  });

  it('FE-HOOK-ROUTE-010: non-AbortError from server keeps straight route without client OSRM fallback', async () => {
    useSettingsStore.setState({ settings: { route_calculation: true } as any });

    getDayRouteSpy.mockRejectedValueOnce(new Error('Network error'));

    const p1 = buildPlace({ lat: 10, lng: 10 });
    const p2 = buildPlace({ lat: 20, lng: 20 });
    const a1 = buildAssignment({ day_id: 5, order_index: 0, place: p1 });
    const a2 = buildAssignment({ day_id: 5, order_index: 1, place: p2 });
    const store = buildMockStore({ '5': [a1, a2] });

    const { result } = renderHook(
      () => useRouteCalculation(store as TripStoreState, 5),
      { wrapper },
    );

    await act(async () => {});
    expect(mockCalculateSegments).not.toHaveBeenCalled();
    expect(result.current.route).toEqual([[[p1.lat, p1.lng], [p2.lat, p2.lng]]]);
    expect(result.current.routeSegments).toEqual([]);
  });

  it('FE-HOOK-ROUTE-011: when selectedDayId is null, route and segments are cleared', async () => {
    const p1 = buildPlace({ lat: 10, lng: 10 });
    const p2 = buildPlace({ lat: 20, lng: 20 });
    const a1 = buildAssignment({ day_id: 5, order_index: 0, place: p1 });
    const a2 = buildAssignment({ day_id: 5, order_index: 1, place: p2 });
    const store = buildMockStore({ '5': [a1, a2] });

    const { result, rerender } = renderHook(
      ({ dayId }: { dayId: number | null }) => useRouteCalculation(store as TripStoreState, dayId),
      { initialProps: { dayId: 5 as number | null }, wrapper },
    );

    await act(async () => {});

    await act(async () => {
      rerender({ dayId: null });
    });

    expect(result.current.route).toBeNull();
    expect(result.current.routeSegments).toEqual([]);
  });

  it('FE-HOOK-ROUTE-014: #1321 day-1 arrival draws no check-in-hotel → departure leg', async () => {
    // Day 1 = arrival from home: a flight (departure → arrival airport) then two activities,
    // checking into a hotel tonight. The morning hotel is only a check-in fallback, so the
    // hotel must NOT be bookended to the flight's departure point; the evening leg stays.
    const dep = { lat: 50.03, lng: 8.57 };  // home/departure airport
    const arr = { lat: 41.30, lng: 2.08 };  // destination airport
    const actA = buildPlace({ lat: 41.38, lng: 2.17 });
    const actB = buildPlace({ lat: 41.40, lng: 2.19 });
    const hotel = { lat: 41.39, lng: 2.16 };

    const flight = {
      id: 100, type: 'flight', day_id: 1, end_day_id: 1, day_plan_position: 0,
      endpoints: [
        { role: 'from', lat: dep.lat, lng: dep.lng },
        { role: 'to', lat: arr.lat, lng: arr.lng },
      ],
    };
    const a1 = buildAssignment({ day_id: 1, order_index: 1, place: actA });
    const a2 = buildAssignment({ day_id: 1, order_index: 2, place: actB });
    const accommodations = [{ id: 1, start_day_id: 1, end_day_id: 2, place_lat: hotel.lat, place_lng: hotel.lng }];
    // A single stable store reference (like buildMockStore) so selectedDayAssignments
    // keeps its identity across renders and the effect doesn't loop.
    const store = { assignments: { '1': [a1, a2] } } as unknown as TripStoreState;
    useTripStore.setState({
      assignments: store.assignments,
      reservations: [flight],
      days: [{ id: 1, day_number: 1 }, { id: 2, day_number: 2 }],
    } as any);

    const { result } = renderHook(() =>
      useRouteCalculation(store, 1, true, 'driving', accommodations as any)
    );

    await act(async () => {});

    const legs = (result.current.route ?? []).map(run => run.map(p => `${p[0]},${p[1]}`));
    // The spurious morning bookend [hotel → departure airport] must be gone.
    expect(legs).not.toContainEqual([`${hotel.lat},${hotel.lng}`, `${dep.lat},${dep.lng}`]);
    // The route starts the day's run at the arrival airport, not the hotel.
    expect(result.current.route?.[0]?.[0]).toEqual([arr.lat, arr.lng]);
    // The evening leg [last activity → hotel] is still drawn.
    expect(legs).toContainEqual([`${actB.lat},${actB.lng}`, `${hotel.lat},${hotel.lng}`]);
  });

  it('FE-HOOK-ROUTE-015: day-1 with no transport keeps the hotel → first-activity leg', async () => {
    // Guard against over-suppression: with no arrival transport, the check-in day is a
    // home-base loop and the hotel → first-stop leg must remain.
    const actA = buildPlace({ lat: 41.38, lng: 2.17 });
    const actB = buildPlace({ lat: 41.40, lng: 2.19 });
    const hotel = { lat: 41.39, lng: 2.16 };
    const a1 = buildAssignment({ day_id: 1, order_index: 0, place: actA });
    const a2 = buildAssignment({ day_id: 1, order_index: 1, place: actB });
    const accommodations = [{ id: 1, start_day_id: 1, end_day_id: 2, place_lat: hotel.lat, place_lng: hotel.lng }];
    const store = { assignments: { '1': [a1, a2] } } as unknown as TripStoreState;
    useTripStore.setState({
      assignments: store.assignments,
      reservations: [],
      days: [{ id: 1, day_number: 1 }, { id: 2, day_number: 2 }],
    } as any);

    const { result } = renderHook(() =>
      useRouteCalculation(store, 1, true, 'driving', accommodations as any)
    );

    await act(async () => {});

    const legs = (result.current.route ?? []).map(run => run.map(p => `${p[0]},${p[1]}`));
    expect(legs).toContainEqual([`${hotel.lat},${hotel.lng}`, `${actA.lat},${actA.lng}`]);
    expect(legs).toContainEqual([`${actB.lat},${actB.lng}`, `${hotel.lat},${hotel.lng}`]);
  });

  it('FE-HOOK-ROUTE-016: #1297 transfer day with no activities draws the hotel → hotel leg', async () => {
    // Day 2 is a pure transfer: check out of hotel A (slept there last night) and into
    // hotel B tonight, with no activities or transport. The map must still draw A → B.
    const hotelA = { lat: 48.86, lng: 2.35 };
    const hotelB = { lat: 45.76, lng: 4.84 };
    const accommodations = [
      { id: 1, start_day_id: 1, end_day_id: 2, place_lat: hotelA.lat, place_lng: hotelA.lng },
      { id: 2, start_day_id: 2, end_day_id: 3, place_lat: hotelB.lat, place_lng: hotelB.lng },
    ];
    const store = { assignments: {} } as unknown as TripStoreState;
    useTripStore.setState({
      assignments: {},
      reservations: [],
      days: [{ id: 1, day_number: 1 }, { id: 2, day_number: 2 }, { id: 3, day_number: 3 }],
    } as any);

    const { result } = renderHook(() =>
      useRouteCalculation(store, 2, true, 'driving', accommodations as any)
    );

    await act(async () => {});

    const legs = (result.current.route ?? []).map(run => run.map(p => `${p[0]},${p[1]}`));
    expect(legs).toContainEqual([`${hotelA.lat},${hotelA.lng}`, `${hotelB.lat},${hotelB.lng}`]);
  });

  it('FE-HOOK-ROUTE-017: #1297 rest day in one hotel with no activities draws nothing', async () => {
    // Guard against a zero-length loop: morning and evening hotel are the same, no
    // activities — no transfer leg should be drawn.
    const hotel = { lat: 48.86, lng: 2.35 };
    const accommodations = [
      { id: 1, start_day_id: 1, end_day_id: 4, place_lat: hotel.lat, place_lng: hotel.lng },
    ];
    const store = { assignments: {} } as unknown as TripStoreState;
    useTripStore.setState({
      assignments: {},
      reservations: [],
      days: [{ id: 1, day_number: 1 }, { id: 2, day_number: 2 }, { id: 3, day_number: 3 }],
    } as any);

    const { result } = renderHook(() =>
      useRouteCalculation(store, 2, true, 'driving', accommodations as any)
    );

    await act(async () => {});

    expect(result.current.route).toBeNull();
  });

  it('FE-HOOK-ROUTE-012: setRoute and setRouteInfo are exposed', () => {
    const store = buildMockStore({});
    const { result } = renderHook(
      () => useRouteCalculation(store as TripStoreState, null),
      { wrapper },
    );
    expect(result.current.setRoute).toBeTypeOf('function');
    expect(result.current.setRouteInfo).toBeTypeOf('function');
  });

  it('FE-HOOK-ROUTE-013: route recalculates when assignments change via store update', async () => {
    useSettingsStore.setState({ settings: { route_calculation: true } as any });

    const p1 = buildPlace({ lat: 10, lng: 10 });
    const p2 = buildPlace({ lat: 20, lng: 20 });
    const a1 = buildAssignment({ day_id: 5, order_index: 0, place: p1 });
    const a2 = buildAssignment({ day_id: 5, order_index: 1, place: p2 });

    let storeData = buildMockStore({ '5': [a1, a2] });

    const { result, rerender } = renderHook(
      () => useRouteCalculation(storeData as TripStoreState, 5),
      { wrapper },
    );

    await act(async () => {});

    expect(result.current.route).toEqual([
      [[p1.lat, p1.lng], [p2.lat, p2.lng]],
    ]);

    const p3 = buildPlace({ lat: 30, lng: 30 });
    const a3 = buildAssignment({ day_id: 5, order_index: 2, place: p3 });

    await act(async () => {
      storeData = buildMockStore({ '5': [a1, a2, a3] });
      rerender();
    });

    await waitFor(() => {
      expect(result.current.route).toEqual([
        [[p1.lat, p1.lng], [p2.lat, p2.lng], [p3.lat, p3.lng]],
      ]);
    });
  });

  it('FE-HOOK-ROUTE-014: all-days mode fetches day routes with bounded parallelism', async () => {
    useSettingsStore.setState({ settings: { route_calculation: true } as any });

    const resolvers: Array<(v: unknown) => void> = [];
    let inFlight = 0;
    let maxInFlight = 0;

    getDayRouteSpy.mockImplementation((_tripId, _dayId, opts) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise(resolve => {
        resolvers.push((value) => {
          inFlight -= 1;
          resolve(value);
        });
        opts?.signal?.addEventListener('abort', () => {
          inFlight -= 1;
          resolve({ segments: [], legs: [] });
        });
      });
    });

    const p1 = buildPlace({ lat: 10, lng: 10 });
    const p2 = buildPlace({ lat: 20, lng: 20 });
    const dayIds = Array.from({ length: 8 }, (_, i) => i + 1);
    const assignments = Object.fromEntries(
      dayIds.map(id => [`${id}`, [
        buildAssignment({ day_id: id, order_index: 0, place: p1 }),
        buildAssignment({ day_id: id, order_index: 1, place: p2 }),
      ]]),
    );
    useTripStore.setState({
      assignments,
      reservations: [],
      days: dayIds.map(id => ({ id, trip_id: 42 })),
      trip: { id: 42 } as any,
    });
    const store = { assignments } as Partial<TripStoreState>;

    renderHook(
      () => useRouteCalculation(store as TripStoreState, null),
      { wrapper },
    );

    await act(async () => {});

    expect(maxInFlight).toBeGreaterThan(1);
    expect(getDayRouteSpy).toHaveBeenCalledTimes(4);

    await act(async () => {
      resolvers.splice(0).forEach(r => r({
        segments: [[[p1.lat!, p1.lng!], [p2.lat!, p2.lng!]]],
        legs: [],
      }));
    });

    await act(async () => {});
    expect(getDayRouteSpy).toHaveBeenCalledTimes(8);

    await act(async () => {
      resolvers.splice(0).forEach(r => r({
        segments: [[[p1.lat!, p1.lng!], [p2.lat!, p2.lng!]]],
        legs: [],
      }));
    });
  });

  it('FE-HOOK-ROUTE-015: all-days mode falls back to straight segments on partial failure', async () => {
    useSettingsStore.setState({ settings: { route_calculation: true } as any });

    const p1 = buildPlace({ lat: 10, lng: 10 });
    const p2 = buildPlace({ lat: 20, lng: 20 });
    const assignments = {
      '1': [
        buildAssignment({ day_id: 1, order_index: 0, place: p1 }),
        buildAssignment({ day_id: 1, order_index: 1, place: p2 }),
      ],
      '2': [
        buildAssignment({ day_id: 2, order_index: 0, place: p1 }),
        buildAssignment({ day_id: 2, order_index: 1, place: p2 }),
      ],
    };
    useTripStore.setState({
      assignments,
      reservations: [],
      days: [{ id: 1, trip_id: 42 }, { id: 2, trip_id: 42 }],
      trip: { id: 42 } as any,
    });
    const store = { assignments } as Partial<TripStoreState>;

    getDayRouteSpy
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        segments: [[[30, 30], [40, 40]]],
        legs: [],
      });

    const { result } = renderHook(
      () => useRouteCalculation(store as TripStoreState, null),
      { wrapper },
    );

    await act(async () => {});

    expect(result.current.route).toEqual([
      [[p1.lat, p1.lng], [p2.lat, p2.lng]],
      [[30, 30], [40, 40]],
    ]);
  });

  it('FE-HOOK-ROUTE-016: all-days fetch aborts when selectedDayId changes', async () => {
    useSettingsStore.setState({ settings: { route_calculation: true } as any });

    const resolvers: Array<(v: unknown) => void> = [];
    getDayRouteSpy.mockImplementation((_tripId, _dayId, opts) =>
      new Promise(resolve => {
        resolvers.push((value) => resolve(value));
        opts?.signal?.addEventListener('abort', () => resolve({ segments: [], legs: [] }));
      }),
    );

    const p1 = buildPlace({ lat: 10, lng: 10 });
    const p2 = buildPlace({ lat: 20, lng: 20 });
    const assignments = {
      '1': [
        buildAssignment({ day_id: 1, order_index: 0, place: p1 }),
        buildAssignment({ day_id: 1, order_index: 1, place: p2 }),
      ],
      '2': [
        buildAssignment({ day_id: 2, order_index: 0, place: p1 }),
        buildAssignment({ day_id: 2, order_index: 1, place: p2 }),
      ],
    };
    useTripStore.setState({
      assignments,
      reservations: [],
      days: [{ id: 1, trip_id: 42 }, { id: 2, trip_id: 42 }],
      trip: { id: 42 } as any,
    });
    const store = { assignments } as Partial<TripStoreState>;

    const { rerender } = renderHook(
      ({ dayId }: { dayId: number | null }) => useRouteCalculation(store as TripStoreState, dayId),
      { initialProps: { dayId: null as number | null }, wrapper },
    );

    await act(async () => {
      rerender({ dayId: 1 });
    });

    expect(getDayRouteSpy.mock.calls.some(([, dayId]) => dayId === 1)).toBe(true);

    await act(async () => {
      resolvers.forEach(r => r({ segments: [[[10, 10], [20, 20]]], legs: [] }));
    });
  });
});
