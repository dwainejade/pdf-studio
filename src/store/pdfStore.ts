import { create } from 'zustand'
import type { PageGroup, PdfPage, UploadedPdf } from '../types/pdf'

const HISTORY_LIMIT = 50

interface StoreSnapshot {
  pdfs: UploadedPdf[]
  pages: PdfPage[]
  groups: PageGroup[]
  nextGroupNumber: number
  selectedPageIds: string[]
}

interface PdfStore extends StoreSnapshot {
  past: StoreSnapshot[]
  future: StoreSnapshot[]
  addPdf: (pdf: UploadedPdf, pages: PdfPage[]) => void
  restoreWorkspace: (workspace: StoreSnapshot) => void
  reorderPages: (activeId: string, overId: string, side?: 'before' | 'after') => void
  togglePageSelection: (pageId: string) => void
  setPageSelection: (pageIds: string[]) => void
  clearSelection: () => void
  deletePages: (pageIds: string[]) => void
  duplicatePages: (pageIds: string[]) => string | undefined
  rotatePages: (pageIds: string[], delta: number) => void
  renamePage: (pageId: string, label: string) => void
  groupPages: (pageIds: string[]) => void
  renameGroup: (groupId: string, name: string) => void
  ungroupPages: (pageIds: string[]) => void
  undo: () => void
  redo: () => void
}

function normalizeRotation(rotation: number): number {
  const wrapped = rotation % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

function makeCopyName(name: string, usedNames: Set<string>): string {
  let copyName = `${name} (Copy)`
  let copyNumber = 2
  while (usedNames.has(copyName.toLocaleLowerCase())) {
    copyName = `${name} (Copy ${copyNumber})`
    copyNumber += 1
  }
  usedNames.add(copyName.toLocaleLowerCase())
  return copyName
}

function snapshot(state: StoreSnapshot): StoreSnapshot {
  return {
    pdfs: state.pdfs,
    pages: state.pages,
    groups: state.groups,
    nextGroupNumber: state.nextGroupNumber,
    selectedPageIds: state.selectedPageIds,
  }
}

export const usePdfStore = create<PdfStore>((set, get) => {
  const commit = (next: StoreSnapshot) => {
    const current = get()
    if (
      current.pdfs === next.pdfs &&
      current.pages === next.pages &&
      current.groups === next.groups &&
      current.nextGroupNumber === next.nextGroupNumber &&
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
    groups: [],
    nextGroupNumber: 0,
    selectedPageIds: [],
    past: [],
    future: [],
    addPdf: (pdf, pages) => {
      const current = get()
      commit({
        pdfs: [...current.pdfs, pdf],
        pages: [...current.pages, ...pages],
        groups: current.groups,
        nextGroupNumber: current.nextGroupNumber,
        selectedPageIds: current.selectedPageIds,
      })
    },
    restoreWorkspace: (workspace) =>
      set({
        ...workspace,
        groups: workspace.groups ?? [],
        nextGroupNumber: workspace.nextGroupNumber ?? 0,
        past: [],
        future: [],
      }),
    reorderPages: (activeId, overId, side) => {
      const current = get()
      const activeIndex = current.pages.findIndex((page) => page.id === activeId)
      const overIndex = current.pages.findIndex((page) => page.id === overId)
      if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return

      const pages = [...current.pages]
      const activeGroupId = current.pages[activeIndex].groupId
      if (activeGroupId && current.pages[overIndex].groupId === activeGroupId) return
      const activeBlock = activeGroupId
        ? pages.filter((page) => page.groupId === activeGroupId)
        : [current.pages[activeIndex]]
      const activeIds = new Set(activeBlock.map((page) => page.id))
      const orderedPages = pages.filter((page) => !activeIds.has(page.id))
      if (side) {
        const targetIndex = orderedPages.findIndex((page) => page.id === overId)
        if (targetIndex < 0) return
        orderedPages.splice(side === 'after' ? targetIndex + 1 : targetIndex, 0, ...activeBlock)
      } else {
        const targetIndex = orderedPages.findIndex((page) => page.id === overId)
        if (targetIndex < 0) return
        orderedPages.splice(targetIndex, 0, ...activeBlock)
      }
      commit({ ...snapshot(current), pages: orderedPages })
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
      const remainingGroupIds = new Set(pages.map((page) => page.groupId).filter(Boolean))
      commit({
        pdfs: current.pdfs.filter((pdf) => remainingPdfIds.has(pdf.id)),
        pages,
        groups: current.groups.filter((group) => remainingGroupIds.has(group.id)),
        nextGroupNumber: current.nextGroupNumber,
        selectedPageIds: current.selectedPageIds.filter((id) => !idsToDelete.has(id)),
      })
    },
    duplicatePages: (pageIds) => {
      const current = get()
      const idsToDuplicate = new Set(pageIds)
      const pagesToDuplicate = current.pages.filter((page) => idsToDuplicate.has(page.id))
      if (pagesToDuplicate.length === 0) return undefined

      const usedGroupNames = new Set(current.groups.map((group) => group.name.toLocaleLowerCase()))
      const groupCopies = new Map<string, PageGroup>()
      for (const group of current.groups) {
        const members = current.pages.filter((page) => page.groupId === group.id)
        if (members.length < 2 || !members.every((page) => idsToDuplicate.has(page.id))) continue
        groupCopies.set(group.id, {
          id: crypto.randomUUID(),
          name: makeCopyName(group.name, usedGroupNames),
        })
      }

      const usedPageLabels = new Set(
        current.pages.map((page) =>
          (page.label?.trim() || `${page.sourcePdfName.replace(/\.pdf$/i, '')}_Page_${page.pageNumber}`)
            .replace(/\.pdf$/i, '')
            .toLocaleLowerCase(),
        ),
      )
      const duplicatedPages = pagesToDuplicate.map((page) => {
        const baseLabel =
          page.label?.trim().replace(/\.pdf$/i, '') ||
          `${page.sourcePdfName.replace(/\.pdf$/i, '')}_Page_${page.pageNumber}`
        const copy: PdfPage = {
          ...page,
          id: crypto.randomUUID(),
          label: makeCopyName(baseLabel, usedPageLabels),
        }
        const copiedGroup = page.groupId ? groupCopies.get(page.groupId) : undefined
        if (copiedGroup) copy.groupId = copiedGroup.id
        return copy
      })
      const groups = [...current.groups, ...groupCopies.values()]
      commit({
        ...snapshot(current),
        pages: [...current.pages, ...duplicatedPages],
        groups,
        selectedPageIds: duplicatedPages.map((page) => page.id),
      })
      return groupCopies.values().next().value?.id
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
    groupPages: (pageIds) => {
      const current = get()
      const idsToGroup = new Set(pageIds)
      const groupedPages = current.pages.filter((page) => idsToGroup.has(page.id))
      if (groupedPages.length < 2) return
      const existingGroupId = groupedPages[0].groupId
      if (
        existingGroupId &&
        groupedPages.every((page) => page.groupId === existingGroupId) &&
        current.groups.some((group) => group.id === existingGroupId)
      ) {
        return
      }

      const groupNumber = current.nextGroupNumber + 1
      const id = crypto.randomUUID()
      let pages = current.pages.map((page) =>
        idsToGroup.has(page.id) ? { ...page, groupId: id } : page,
      )
      const memberCounts = new Map<string, number>()
      for (const page of pages) {
        if (page.groupId) memberCounts.set(page.groupId, (memberCounts.get(page.groupId) ?? 0) + 1)
      }
      const dissolvedGroupIds = new Set(
        [...memberCounts]
          .filter(([groupId, count]) => groupId !== id && count < 2)
          .map(([groupId]) => groupId),
      )
      if (dissolvedGroupIds.size > 0) {
        pages = pages.map((page) => {
          if (!page.groupId || !dissolvedGroupIds.has(page.groupId)) return page
          const { groupId: _groupId, ...ungroupedPage } = page
          return ungroupedPage
        })
      }
      const remainingGroupIds = new Set(pages.map((page) => page.groupId).filter(Boolean))
      const groups = current.groups.filter((group) => remainingGroupIds.has(group.id))
      groups.push({ id, name: `Group ${groupNumber}` })
      commit({ ...snapshot(current), pages, groups, nextGroupNumber: groupNumber })
    },
    renameGroup: (groupId, name) => {
      const normalizedName = name.trim()
      if (!normalizedName) return
      const current = get()
      if (!current.groups.some((group) => group.id === groupId && group.name !== normalizedName)) {
        return
      }
      const groups = current.groups.map((group) =>
        group.id === groupId ? { ...group, name: normalizedName } : group,
      )
      commit({ ...snapshot(current), groups })
    },
    ungroupPages: (pageIds) => {
      const current = get()
      const idsToUngroup = new Set(pageIds)
      let pages: PdfPage[] = current.pages.map((page) => {
        if (!idsToUngroup.has(page.id) || !page.groupId) return page
        const { groupId: _groupId, ...ungroupedPage } = page
        return ungroupedPage
      })
      const memberCounts = new Map<string, number>()
      for (const page of pages) {
        if (page.groupId) memberCounts.set(page.groupId, (memberCounts.get(page.groupId) ?? 0) + 1)
      }
      const dissolvedGroupIds = new Set(
        [...memberCounts].filter(([, count]) => count < 2).map(([groupId]) => groupId),
      )
      if (dissolvedGroupIds.size > 0) {
        pages = pages.map((page) => {
          if (!page.groupId || !dissolvedGroupIds.has(page.groupId)) return page
          const { groupId: _groupId, ...ungroupedPage } = page
          return ungroupedPage
        })
      }
      const remainingGroupIds = new Set(pages.map((page) => page.groupId).filter(Boolean))
      const groups = current.groups.filter((group) => remainingGroupIds.has(group.id))
      if (
        pages.every((page, index) => page === current.pages[index]) &&
        groups.length === current.groups.length
      ) {
        return
      }
      commit({ ...snapshot(current), pages, groups })
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
