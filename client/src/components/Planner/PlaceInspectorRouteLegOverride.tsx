import { Route as RouteIcon } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import { useTranslation } from '../../i18n'
import { useRouteLegOverride } from '../../hooks/useRouteLegOverride'
import { useRouteModes } from '../../hooks/useRouteModes'
import { routeModeLabel } from '../../utils/routeMode'
import type { Assignment } from '../../types'

interface PlaceInspectorRouteLegOverrideProps {
  tripId: number
  selectedDayId: number
  assignment: Assignment
}

/** Per-assignment route leg override control for the place inspector. */
export function PlaceInspectorRouteLegOverride({
  tripId,
  selectedDayId,
  assignment,
}: PlaceInspectorRouteLegOverrideProps) {
  const { t } = useTranslation()
  const { modes } = useRouteModes()
  const routeCalcOn = useSettingsStore(s => s.settings.route_calculation) !== false
  const { selectValue, saving, onSelectChange } = useRouteLegOverride(tripId, selectedDayId, assignment)

  return (
    <div style={{ background: 'var(--bg-hover)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <RouteIcon size={13} color="#9ca3af" />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{t('inspector.routeLegLabel')}</span>
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-faint)', margin: 0, lineHeight: 1.35 }}>{t('inspector.routeLegInheritHelp')}</p>
      {!routeCalcOn && (
        <p style={{ fontSize: 10, color: 'var(--text-faint)', margin: 0, lineHeight: 1.35 }}>{t('inspector.routeLegRouteCalcHint')}</p>
      )}
      <select
        disabled={saving}
        value={selectValue}
        onChange={(e) => { void onSelectChange(e.target.value) }}
        style={{
          fontSize: 12,
          padding: '6px 10px',
          borderRadius: 8,
          border: '1px solid var(--border-primary)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          fontFamily: 'inherit',
          cursor: saving ? 'wait' : 'pointer',
        }}
      >
        <option value="inherit">{t('inspector.routeLegInherit')}</option>
        {modes.map(mode => (
          <option key={mode.mode} value={mode.mode}>{routeModeLabel(mode, t)}</option>
        ))}
      </select>
    </div>
  )
}
