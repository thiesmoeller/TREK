import { create } from 'zustand'
import type { RouteModeDescriptor } from '@trek/shared'
import { routeModesApi } from '../api/client'

interface RouteModesState {
  modes: RouteModeDescriptor[]
  loaded: boolean
  loadRouteModes: () => Promise<RouteModeDescriptor[]>
  getMode: (mode: string) => RouteModeDescriptor | undefined
}

export const useRouteModesStore = create<RouteModesState>((set, get) => ({
  modes: [],
  loaded: false,

  loadRouteModes: async () => {
    try {
      const data = await routeModesApi.list() as { modes?: RouteModeDescriptor[] }
      const modes = data.modes ?? []
      set({ modes, loaded: true })
      return modes
    } catch {
      set({ loaded: true })
      return get().modes
    }
  },

  getMode: (mode) => get().modes.find(m => m.mode === mode),
}))
