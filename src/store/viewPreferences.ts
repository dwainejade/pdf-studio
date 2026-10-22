import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface ViewPreferences {
  thumbnailSize: number
  searchQuery: string
  setThumbnailSize: (thumbnailSize: number) => void
  setSearchQuery: (searchQuery: string) => void
}

export const useViewPreferences = create<ViewPreferences>()(
  persist(
    (set) => ({
      thumbnailSize: 100,
      searchQuery: '',
      setThumbnailSize: (thumbnailSize) =>
        set({ thumbnailSize: Math.min(300, Math.max(50, thumbnailSize)) }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
    }),
    {
      name: 'pdf-studio-view-preferences',
      version: 3,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState) => {
        const state = persistedState as Partial<ViewPreferences>
        return { thumbnailSize: state.thumbnailSize, searchQuery: state.searchQuery }
      },
      partialize: (state) => ({
        thumbnailSize: state.thumbnailSize,
        searchQuery: state.searchQuery,
      }),
    },
  ),
)
