import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type ThemePreference = 'system' | 'light' | 'dark'

interface ViewPreferences {
  theme: ThemePreference
  thumbnailSize: number
  searchQuery: string
  setTheme: (theme: ThemePreference) => void
  setThumbnailSize: (thumbnailSize: number) => void
  setSearchQuery: (searchQuery: string) => void
}

export const useViewPreferences = create<ViewPreferences>()(
  persist(
    (set) => ({
      theme: 'system',
      thumbnailSize: 100,
      searchQuery: '',
      setTheme: (theme) => set({ theme }),
      setThumbnailSize: (thumbnailSize) =>
        set({ thumbnailSize: Math.min(300, Math.max(50, thumbnailSize)) }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
    }),
    {
      name: 'pdf-studio-view-preferences',
      version: 4,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState) => {
        const state = persistedState as Partial<ViewPreferences>
        return { theme: state.theme, thumbnailSize: state.thumbnailSize, searchQuery: state.searchQuery }
      },
      partialize: (state) => ({
        theme: state.theme,
        thumbnailSize: state.thumbnailSize,
        searchQuery: state.searchQuery,
      }),
    },
  ),
)
