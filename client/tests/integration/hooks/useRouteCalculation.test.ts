import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRouteCalculation } from '../../../src/hooks/useRouteCalculation';
import { TranslationProvider } from '../../../src/i18n/TranslationContext';
import { useSettingsStore } from '../../../src/store/settingsStore';
import { useTripStore } from '../../../src/store/tripStore';
import { calculateSegments } from '../../../src/components/Map/RouteCalculator';
import { tripsApi } from '../../../src/api/client';
import { buildAssignment, buildPlace } from '../../helpers/factories';
import type { TripStoreState } from '../../../src/store/tripStore';
import type { RouteSegment } from '../../../src/types';

vi.mock('../../../src/components/Map/RouteCalculator', () => ({
  calculateSegments: vi.fn(),
  calculateRoute: vi.fn(),
  optimizeRoute: vi.fn((waypoints: unknown[]) => waypoints),
  generateGoogleMapsUrl: vi.fn(),
}));

const { calculateSegments } = await import('../../../src/components/Map/RouteCalculator');

const postSpy = vi.spyOn(tripsApi, 'postDayRouteGeometry');

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
    (calculateSegments as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SEGMENTS);
    postSpy.mockResolvedValue({
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
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('FE-HOOK-ROUTE-004: with route_calculation enabled, uses server mixed-route API', async () => {
    useSettingsStore.setState({ settings: { route_calculation: true } as any });

    const p1 = buildPlace({ lat: 48.8566, lng: 2.3522 });
    const p2 = buildPlace({ lat: 51.5074, lng: -0.1278 });
    const a1 = buildAssignment({ day_id: 5, order_index: 0, place: p1 });
    const a2 = buildAssignment({ day_id: 5, order_index: 1, place: p2 });
    const store = buildMockStore({ '5': [a1, a2] });

    postSpy.mockResolvedValueOnce({
      segments: [[[p1.lat, p1.lng], [p2.lat, p2.lng]]],
      legs: MOCK_SEGMENTS.map(s => ({
        polylineIndex: 0,
        rowingText: null,
        walkingText: s.walkingText,
        drivingText: s.drivingText,
        mid: s.mid,
        from: s.from,
        to: s.to,
        kind: 'walking',
        distanceM: 42_000,
        durationS: 7200,
      })),
    });

    const { result } = renderHook(
      () => useRouteCalculation(store as TripStoreState, 5),
      { wrapper },
    );

    await act(async () => {});

    expect(postSpy).toHaveBeenCalled();
    expect(calculateSegments).not.toHaveBeenCalled();
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

    expect(postSpy).not.toHaveBeenCalled();
    expect(calculateSegments).not.toHaveBeenCalled();
    expect(result.current.routeSegments).toEqual([]);
  });

  it('FE-HOOK-ROUTE-006: assignments sorted by order_index; server replaces polyline geometry', async () => {
    useSettingsStore.setState({ settings: { route_calculation: true } as any });

    const p1 = buildPlace({ lat: 10, lng: 10 });
    const p2 = buildPlace({ lat: 20, lng: 20 });
    const a1 = buildAssignment({ day_id: 5, order_index: 1, place: p1 });
    const a2 = buildAssignment({ day_id: 5, order_index: 0, place: p2 });
    const store = buildMockStore({ '5': [a1, a2] });

    postSpy.mockResolvedValueOnce({
      segments: [[[20, 20], [10, 10]]],
      legs: [],
    });

    const { result } = renderHook(
      () => useRouteCalculation(store as TripStoreState, 5),
      { wrapper },
    );

    await act(async () => {});

    expect(result.current.route).toEqual([[[20, 20], [10, 10]]]);
    expect(postSpy).toHaveBeenCalledWith(42, 5, expect.any(Object));
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
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('FE-HOOK-ROUTE-008: AbortController.abort() when selectedDayId changes', async () => {
    useSettingsStore.setState({ settings: { route_calculation: true } as any });

    let resolvePost!: (v: unknown) => void;
    postSpy.mockImplementationOnce((_tripId: unknown, _dayId: unknown, opts: { signal?: AbortSignal }) =>
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

    expect(postSpy.mock.calls.length).toBeGreaterThanOrEqual(1);

    resolvePost?.({ segments: [], legs: [] });
  });

  it('FE-HOOK-ROUTE-009: AbortError from server route call does not repopulate segments', async () => {
    useSettingsStore.setState({ settings: { route_calculation: true } as any });

    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    postSpy.mockRejectedValueOnce(abortError);

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
    expect(postSpy).toHaveBeenCalled();
    expect(calculateSegments).not.toHaveBeenCalled();
  });

  it('FE-HOOK-ROUTE-010: non-AbortError from server falls back to OSRM calculateSegments', async () => {
    useSettingsStore.setState({ settings: { route_calculation: true } as any });

    postSpy.mockRejectedValueOnce(new Error('Network error'));

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
    expect(calculateSegments).toHaveBeenCalled();
    expect(result.current.routeSegments.length).toBeGreaterThan(0);
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
});
