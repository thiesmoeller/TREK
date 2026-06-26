import { describe, expect, it } from 'vitest'
import {
  addAccommodationBookendsToServerRoute,
  addAccommodationBookendsToStraightSegments,
} from './useRouteCalculation'
import type { DayRouteLeg } from '@trek/shared'

const serverLeg = (polylineIndex: number, from: [number, number], to: [number, number]): DayRouteLeg => ({
  polylineIndex,
  routeMode: 'waterway',
  distanceM: 1000,
  durationS: 600,
  isApproximate: false,
  mid: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2],
  from,
  to,
})

describe('addAccommodationBookendsToServerRoute', () => {
  it('preserves a start accommodation leg before successful server geometry', () => {
    const result = addAccommodationBookendsToServerRoute(
      [[[1, 1], [2, 2]]],
      [serverLeg(0, [1, 1], [2, 2])],
      { start: [[0, 0], [1, 1]] },
    )

    expect(result.segments).toEqual([
      [[0, 0], [1, 1]],
      [[1, 1], [2, 2]],
    ])
    expect(result.legs.map(l => l.polylineIndex)).toEqual([1])
  })

  it('preserves an end accommodation leg after successful server geometry', () => {
    const result = addAccommodationBookendsToServerRoute(
      [[[1, 1], [2, 2]]],
      [serverLeg(0, [1, 1], [2, 2])],
      { end: [[2, 2], [3, 3]] },
    )

    expect(result.segments).toEqual([
      [[1, 1], [2, 2]],
      [[2, 2], [3, 3]],
    ])
    expect(result.legs.map(l => l.polylineIndex)).toEqual([0])
  })

  it('preserves both accommodation bookends around multi-segment server geometry', () => {
    const result = addAccommodationBookendsToServerRoute(
      [
        [[1, 1], [2, 2]],
        [[4, 4], [5, 5]],
      ],
      [
        serverLeg(0, [1, 1], [2, 2]),
        serverLeg(1, [4, 4], [5, 5]),
      ],
      {
        start: [[0, 0], [1, 1]],
        end: [[5, 5], [6, 6]],
      },
    )

    expect(result.segments).toEqual([
      [[0, 0], [1, 1]],
      [[1, 1], [2, 2]],
      [[4, 4], [5, 5]],
      [[5, 5], [6, 6]],
    ])
    expect(result.legs.map(l => l.polylineIndex)).toEqual([1, 2])
  })

  it('leaves server geometry and leg indexes unchanged when there are no accommodation bookends', () => {
    const segments: [number, number][][] = [[[1, 1], [2, 2]]]
    const legs = [serverLeg(0, [1, 1], [2, 2])]

    expect(addAccommodationBookendsToServerRoute(segments, legs, {})).toEqual({ segments, legs })
  })
})

describe('addAccommodationBookendsToStraightSegments', () => {
  it('keeps straight-line preview bookends around the existing route segments', () => {
    expect(addAccommodationBookendsToStraightSegments(
      [[[1, 1], [2, 2]]],
      {
        start: [[0, 0], [1, 1]],
        end: [[2, 2], [3, 3]],
      },
    )).toEqual([
      [[0, 0], [1, 1]],
      [[1, 1], [2, 2]],
      [[2, 2], [3, 3]],
    ])
  })

  it('can draw only accommodation bookends for a single located stop preview', () => {
    expect(addAccommodationBookendsToStraightSegments(
      [],
      {
        start: [[0, 0], [1, 1]],
        end: [[1, 1], [2, 2]],
      },
    )).toEqual([
      [[0, 0], [1, 1]],
      [[1, 1], [2, 2]],
    ])
  })
})
