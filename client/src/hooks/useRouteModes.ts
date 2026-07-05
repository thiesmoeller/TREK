import { useEffect } from 'react'
import { useRouteModesStore } from '../store/routeModesStore'

/** Fetches GET /api/route-modes once and caches descriptors in zustand. */
export function useRouteModes() {
  const modes = useRouteModesStore(s => s.modes)
  const loaded = useRouteModesStore(s => s.loaded)
  const loadRouteModes = useRouteModesStore(s => s.loadRouteModes)
  const getMode = useRouteModesStore(s => s.getMode)

  useEffect(() => {
    if (!loaded) void loadRouteModes()
  }, [loaded, loadRouteModes])

  return { modes, loaded, loadRouteModes, getMode }
}
