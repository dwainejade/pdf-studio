import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type PageViewMode = 'grid' | 'detail'
export type DetailSortKey = 'importOrder' | 'fileName' | 'pageNumber' | 'title' | 'author'

interface ViewPreferences {
  viewMode: PageViewMode
  thumbnailSize: number
  searchQuery: string
  detailSortKey: DetailSortKey
  setViewMode: (viewMode: PageViewMode) => void
  setThumbnailSize: (thumbnailSize: number) => void
  setSearchQuery: (searchQuery: string) => void
  setDetailSortKey: (detailSortKey: DetailSortKey) => void
}

export const useViewPreferences = create<ViewPreferences>()(
  persist(
    (set) => ({
      viewMode: 'grid',
      thumbnailSize: 100,
      searchQuery: '',
      detailSortKey: 'importOrder',
      setViewMode: (viewMode) => set({ viewMode }),
      setThumbnailSize: (thumbnailSize) =>
        set({ thumbnailSize: Math.min(200, Math.max(50, thumbnailSize)) }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setDetailSortKey: (detailSortKey) => set({ detailSortKey }),
    }),
    {
      name: 'pdf-studio-view-preferences',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState) => {
        const state = persistedState as Partial<ViewPreferences>
        return {
          ...state,
          viewMode: state.viewMode === 'detail' ? 'detail' : 'grid',
          detailSortKey:
            state.detailSortKey && ['importOrder', 'fileName', 'pageNumber', 'title', 'author'].includes(state.detailSortKey)
              ? state.detailSortKey
              : 'importOrder',
        }
      },
      partialize: (state) => ({
        viewMode: state.viewMode,
        thumbnailSize: state.thumbnailSize,
        searchQuery: state.searchQuery,
        detailSortKey: state.detailSortKey,
      }),
    },
  ),
)
