import { useState } from 'react'
import { assignmentsApi } from '../api/client'
import { useTripStore } from '../store/tripStore'
import type { Assignment } from '../types'

type RouteModeOverride = NonNullable<Assignment['route_mode_override']>

export function useRouteLegOverride(
  tripId: number | null,
  selectedDayId: number | null,
  assignment: Assignment | null | undefined,
) {
  const [saving, setSaving] = useState(false)

  const selectValue = assignment?.route_mode_override == null
    ? 'inherit'
    : String(assignment.route_mode_override)

  const onSelectChange = async (raw: string) => {
    if (tripId == null || selectedDayId == null || !assignment) return
    const route_mode_override = raw === 'inherit'
      ? null
      : raw as RouteModeOverride
    setSaving(true)
    try {
      const { assignment: updated } = await assignmentsApi.updateRouteMode(
        tripId,
        selectedDayId,
        assignment.id,
        { route_mode_override },
      )
      useTripStore.setState(state => ({
        assignments: {
          ...state.assignments,
          [String(selectedDayId)]: (state.assignments[String(selectedDayId)] || []).map(a =>
            a.id === updated.id ? { ...a, ...updated } : a,
          ),
        },
      }))
    } catch {
      /** keep previous selection — server rejected */
    } finally {
      setSaving(false)
    }
  }

  return { selectValue, saving, onSelectChange }
}
