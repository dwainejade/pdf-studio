import { create } from 'zustand'
import type { PdfPage, UploadedPdf } from '../types/pdf'

const HISTORY_LIMIT = 50

interface StoreSnapshot {
  pdfs: UploadedPdf[]
  pages: PdfPage[]
  selectedPageIds: string[]
}

interface PdfStore extends StoreSnapshot {
  past: StoreSnapshot[]
  future: StoreSnapshot[]
  addPdf: (pdf: UploadedPdf, pages: PdfPage[]) => void
  restoreWorkspace: (workspace: StoreSnapshot) => void
  reorderPages: (activeId: string, overId: string) => void
  togglePageSelection: (pageId: string) => void
  setPageSelection: (pageIds: string[]) => void
  clearSelection: () => void
  deletePages: (pageIds: string[]) => void
  rotatePages: (pageIds: string[], delta: number) => void
  renamePage: (pageId: string, label: string) => void
  undo: () => void
  redo: () => void
}

function normalizeRotation(rotation: number): number {
  const wrapped = rotation % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

function snapshot(state: StoreSnapshot): StoreSnapshot {
  return {
    pdfs: state.pdfs,
    pages: state.pages,
    selectedPageIds: state.selectedPageIds,
  }
}

export const usePdfStore = create<PdfStore>((set, get) => {
  const commit = (next: StoreSnapshot) => {
    const current = get()
    if (
      current.pdfs === next.pdfs &&
      current.pages === next.pages &&
      current.selectedPageIds === next.selectedPageIds
    ) {
      return
    }
    set({
      ...next,
      past: [...current.past, snapshot(current)].slice(-HISTORY_LIMIT),
      future: [],
    })
  }

  return {
    pdfs: [],
    pages: [],
    selectedPageIds: [],
    past: [],
    future: [],
    addPdf: (pdf, pages) => {
      const current = get()
      commit({
        pdfs: [...current.pdfs, pdf],
        pages: [...current.pages, ...pages],
        selectedPageIds: current.selectedPageIds,
      })
    },
    restoreWorkspace: (workspace) =>
      set({
        ...workspace,
        past: [],
        future: [],
      }),
    reorderPages: (activeId, overId) => {
      const current = get()
      const activeIndex = current.pages.findIndex((page) => page.id === activeId)
      const overIndex = current.pages.findIndex((page) => page.id === overId)
      if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return

      const pages = [...current.pages]
      const [activePage] = pages.splice(activeIndex, 1)
      pages.splice(overIndex, 0, activePage)
      commit({ ...snapshot(current), pages })
    },
    togglePageSelection: (pageId) => {
      const current = get()
      if (!current.pages.some((page) => page.id === pageId)) return
      const selectedPageIds = current.selectedPageIds.includes(pageId)
        ? current.selectedPageIds.filter((id) => id !== pageId)
        : [...current.selectedPageIds, pageId]
      commit({ ...snapshot(current), selectedPageIds })
    },
    setPageSelection: (pageIds) => {
      const current = get()
      const validPageIds = new Set(current.pages.map((page) => page.id))
      const selectedPageIds = [...new Set(pageIds)].filter((id) => validPageIds.has(id))
      if (
        selectedPageIds.length === current.selectedPageIds.length &&
        selectedPageIds.every((id, index) => id === current.selectedPageIds[index])
      ) {
        return
      }
      commit({ ...snapshot(current), selectedPageIds })
    },
    clearSelection: () => {
      const current = get()
      if (current.selectedPageIds.length === 0) return
      commit({ ...snapshot(current), selectedPageIds: [] })
    },
    deletePages: (pageIds) => {
      const current = get()
      const idsToDelete = new Set(pageIds)
      const pages = current.pages.filter((page) => !idsToDelete.has(page.id))
      if (pages.length === current.pages.length) return
      const remainingPdfIds = new Set(pages.map((page) => page.sourcePdfId))
      commit({
        pdfs: current.pdfs.filter((pdf) => remainingPdfIds.has(pdf.id)),
        pages,
        selectedPageIds: current.selectedPageIds.filter((id) => !idsToDelete.has(id)),
      })
    },
    rotatePages: (pageIds, delta) => {
      const current = get()
      const idsToRotate = new Set(pageIds)
      const pages = current.pages.map((page) =>
        idsToRotate.has(page.id)
          ? (() => {
              const rotation = normalizeRotation(page.rotation + delta)
              const quarterTurnChanged =
                Math.floor(normalizeRotation(page.rotation) / 90) % 2 !==
                Math.floor(rotation / 90) % 2
              return {
                ...page,
                rotation,
                width: quarterTurnChanged ? page.height : page.width,
                height: quarterTurnChanged ? page.width : page.height,
              }
            })()
          : page,
      )
      commit({ ...snapshot(current), pages })
    },
    renamePage: (pageId, label) => {
      const current = get()
      const normalizedLabel = label.trim()
      const pages = current.pages.map((page) => {
        if (page.id !== pageId) return page
        if ((page.label ?? '') === normalizedLabel) return page
        const renamedPage = { ...page }
        if (normalizedLabel) renamedPage.label = normalizedLabel
        else delete renamedPage.label
        return renamedPage
      })
      if (pages.every((page, index) => page === current.pages[index])) return
      commit({ ...snapshot(current), pages })
    },
    undo: () => {
      const current = get()
      const previous = current.past.at(-1)
      if (!previous) return
      set({
        ...previous,
        past: current.past.slice(0, -1),
        future: [snapshot(current), ...current.future].slice(0, HISTORY_LIMIT),
      })
    },
    redo: () => {
      const current = get()
      const next = current.future[0]
      if (!next) return
      set({
        ...next,
        past: [...current.past, snapshot(current)].slice(-HISTORY_LIMIT),
        future: current.future.slice(1),
      })
    },
  }
})
