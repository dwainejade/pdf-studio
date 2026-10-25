import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Check, FileText, Layers, Minus, Pencil, X } from 'lucide-react'
import type { PageGroup, PdfPage, UploadedPdf } from '../../types/pdf'
import { PageThumbnail } from './PageThumbnail'
import { useGridWindow } from './useGridWindow'
import { displayName } from '../../lib/displayName'
import {
  animateArrivals,
  collapseSkeleton,
  landDraggedCard,
  setLiftedDragImage,
  type DragRelease,
} from '../../lib/pageAnimations'
import {
  prepareDragOut,
  prepareDragOutFiles,
  readyDragOutFilesPayload,
  readyDragOutPayload,
  type DragOutFileRequest,
} from '../../lib/export/dragOut'

const REARRANGE_ANIMATION_MS = 220
// How far the cards beside the drop bar step away from it.
const NUDGE_PX = 8

type DropSide = 'before' | 'after'

/** Where the pointer took hold of a card, and where the card's preview sat, so a drop can pick up from there. */
interface DragGrab {
  x: number
  y: number
  preview: { left: number; top: number; width: number; height: number }
}

const grabFrom = (event: ReactDragEvent<HTMLElement>): DragGrab => {
  const bounds = event.currentTarget.getBoundingClientRect()
  // A group's slot is its whole stack, not just the cover page on top.
  const preview =
    event.currentTarget.querySelector('.group-preview-stack, .page-preview')?.getBoundingClientRect() ?? bounds
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
    preview: { left: preview.left, top: preview.top, width: preview.width, height: preview.height },
  }
}

// Dropping right beside the dragged card's own spot would leave the order as it is.
function slotChangesNothing(
  items: Array<{ type: 'page'; page: PdfPage } | { type: 'group'; pages: PdfPage[] }>,
  slot: string,
  draggingId: string | null,
): boolean {
  const [overId, side] = slot.split('|')
  const idOf = (item: (typeof items)[number]) => (item.type === 'group' ? item.pages[0].id : item.page.id)
  const overIndex = items.findIndex((item) => idOf(item) === overId)
  const dragIndex = items.findIndex((item) => idOf(item) === draggingId)
  if (overIndex < 0 || dragIndex < 0) return false
  let position = overIndex + (side === 'after' ? 1 : 0)
  if (dragIndex < position) position -= 1
  return position === dragIndex
}

interface PageGridProps {
  pages: PdfPage[]
  allPages: PdfPage[]
  groups: PageGroup[]
  pdfs: UploadedPdf[]
  isProcessing: boolean
  selectedPageIds: string[]
  thumbnailSize: number
  searchQuery: string
  onSetSelection: (pageIds: string[]) => void
  onReorder: (activeId: string, overId: string, side?: DropSide) => void
  onRename: (pageId: string, label: string) => void
  onRenameGroup: (groupId: string, name: string) => void
  onInspectPage: (pageId: string) => void
  onViewPage: (pageId: string) => void
  onOpenGroup: (groupId: string) => void
  onOpenContextMenu: (
    pageIds: string[],
    groupId: string | undefined,
    position: { x: number; y: number },
  ) => void
  expandedGroupId?: string
  groupCanvasName?: string
  onUngroupPage?: (pageId: string) => void
  /** New pages drop in with an animation once the workspace has loaded. */
  animateArrivals?: boolean
}

interface GroupCardProps {
  group: PageGroup
  pages: PdfPage[]
  dragOutFiles: DragOutFileRequest[]
  sourcePdf: UploadedPdf
  pdfs: UploadedPdf[]
  isSelected: boolean
  isBeingDragged: boolean
  onSelect: (modifiers: { extend: boolean; toggle: boolean }) => void
  onDragStart: (pageId: string, grab: DragGrab) => void
  onDragEnd: (event?: ReactDragEvent<HTMLElement>) => void
  onDragOverPage: (pageId: string, event: ReactDragEvent<HTMLElement>) => void
  onRename: (groupId: string, name: string) => void
  onInspectPage: (pageId: string) => void
  onViewPage: (pageId: string) => void
  onOpenGroup: (groupId: string) => void
}

export const RENAME_EVENT = 'pdfstudio-rename'

// Lets the context menu ask a card to start renaming without lifting the editing state.
function useRenameRequest(beginRename: () => void) {
  const ref = useRef<HTMLElement>(null)
  const latest = useRef(beginRename)
  useEffect(() => {
    latest.current = beginRename
  })
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const handle = () => latest.current()
    element.addEventListener(RENAME_EVENT, handle)
    return () => element.removeEventListener(RENAME_EVENT, handle)
  }, [])
  return ref
}

function GroupCard({
  group,
  pages,
  dragOutFiles,
  sourcePdf,
  pdfs,
  isSelected,
  isBeingDragged,
  onSelect,
  onDragStart,
  onDragEnd,
  onDragOverPage,
  onRename,
  onInspectPage,
  onViewPage,
  onOpenGroup,
}: GroupCardProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftName, setDraftName] = useState(group.name)
  const cover = pages[0]
  const firstPageNumber = pages[0].pageNumber
  const lastPageNumber = pages[pages.length - 1].pageNumber
  const pageDescription =
    pages.every((page) => page.sourcePdfId === cover.sourcePdfId) &&
    pages.every((page, index) => page.pageNumber === firstPageNumber + index)
      ? `Pages ${firstPageNumber}–${lastPageNumber}`
      : `${pages.length} pages`

  const finishRename = () => {
    const name = draftName.trim() || group.name
    onRename(group.id, name)
    prepareDragOut(pages, pdfs, name)
    setIsRenaming(false)
  }

  const cancelRename = () => {
    setDraftName(group.name)
    setIsRenaming(false)
  }

  const beginRename = () => {
    setDraftName(group.name)
    setIsRenaming(true)
  }
  const cardRef = useRenameRequest(beginRename)

  return (
    <article
      ref={cardRef}
      className={`page-card group-card${isSelected ? ' is-selected' : ''}${isBeingDragged ? ' is-dragging' : ''}`}
      tabIndex={0}
      draggable
      data-page-id={cover.id}
      data-page-ids={pages.map((page) => page.id).join(' ')}
      data-group-id={group.id}
      aria-label={`${group.name}, ${pageDescription}${isSelected ? ', selected' : ''}`}
      onPointerEnter={() => prepareDragOutFiles(dragOutFiles, pdfs)}
      onPointerDown={() => prepareDragOutFiles(dragOutFiles, pdfs)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copyMove'
        event.dataTransfer.setData('text/plain', cover.id)
        setLiftedDragImage(event, event.currentTarget, dragOutFiles.reduce((total, file) => total + file.pages.length, 0))
        const payload = readyDragOutFilesPayload(dragOutFiles)
        if (payload) event.dataTransfer.setData('DownloadURL', payload)
        onDragStart(cover.id, grabFrom(event))
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => onDragOverPage(cover.id, event)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'F2' || event.key === 'Enter') {
          event.preventDefault()
          beginRename()
        }
      }}
      onClick={(event) => {
        if (event.target instanceof HTMLElement && event.target.closest('input, button')) return
        onInspectPage(cover.id)
        onSelect({ extend: event.shiftKey, toggle: event.ctrlKey || event.metaKey })
      }}
      onDoubleClick={(event) => {
        if (event.target instanceof HTMLElement && event.target.closest('input, button')) return
        onOpenGroup(group.id)
      }}
    >
      <button
        type="button"
        className={`page-select-toggle${isSelected ? ' is-selected' : ''}`}
        aria-label={isSelected ? `Deselect ${group.name}` : `Select ${group.name}`}
        aria-pressed={isSelected}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onInspectPage(cover.id)
          onSelect({ extend: false, toggle: true })
        }}
      >
        {isSelected && <span className="page-select-check">✓</span>}
      </button>
      <div className="group-preview-stack">
        {Array.from({ length: Math.min(pages.length - 1, 4) }, (_, index) => (
          <span
            key={`stack-sheet-${index}`}
            className={`group-preview-sheet group-preview-sheet-layer-${index + 1}`}
            aria-hidden="true"
          />
        ))}
        <PageThumbnail
          className="group-preview-front"
          sourcePdfId={cover.sourcePdfId}
          sourcePdfName={cover.sourcePdfName}
          file={sourcePdf.file}
          pageNumber={cover.pageNumber}
          rotation={cover.rotation}
          textOverlay={cover.textBoxes ? { boxes: cover.textBoxes, page: cover } : undefined}
          onExpand={() => onViewPage(cover.id)}
        />
        <button
          type="button"
          className="group-count-badge"
          aria-label={`Open ${group.name} with ${pages.length} pages`}
          title={`Open ${group.name}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onOpenGroup(group.id)
          }}
        >
          <Layers size={13} aria-hidden="true" />
          {pages.length}
        </button>
      </div>
      <div className="page-metadata group-metadata">
        <div className="page-source group-source">
          {isRenaming ? (
            <input
              className="page-label-input"
              value={draftName}
              autoFocus
              aria-label={`Rename ${group.name}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onFocus={(event) => event.target.select()}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={finishRename}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Enter') finishRename()
                if (event.key === 'Escape') cancelRename()
              }}
            />
          ) : (
            <strong
              className="page-name"
              title="Double-click to rename"
              onDoubleClick={(event) => {
                event.stopPropagation()
                beginRename()
              }}
            >
              {group.name}
            </strong>
          )}
          <span>{pageDescription}</span>
        </div>
        {isRenaming ? (
          <div className="page-label-actions">
            <button
              type="button"
              aria-label={`Save ${group.name}`}
              onPointerDown={(event) => { event.stopPropagation(); event.preventDefault() }}
              onClick={(event) => { event.stopPropagation(); finishRename() }}
            >
              <Check size={13} />
            </button>
            <button
              type="button"
              aria-label={`Cancel renaming ${group.name}`}
              onPointerDown={(event) => { event.stopPropagation(); event.preventDefault() }}
              onClick={(event) => { event.stopPropagation(); cancelRename() }}
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <button
            className="page-rename-button"
            type="button"
            aria-label={`Rename ${group.name}`}
            onPointerDown={(event) => event.stopPropagation()}
            title="Rename (F2)"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              beginRename()
            }}
          >
            <Pencil size={13} />
          </button>
        )}
      </div>
    </article>
  )
}

interface PageCardProps {
  page: PdfPage
  index: number
  pages: PdfPage[]
  sourcePdf: UploadedPdf
  pdfs: UploadedPdf[]
  isSelected: boolean
  isBeingDragged: boolean
  getDragPages: (pageId: string) => PdfPage[]
  getDragFilename: (pages: PdfPage[]) => string | undefined
  onDragStart: (pageId: string, grab: DragGrab) => void
  onDragEnd: (event?: ReactDragEvent<HTMLElement>) => void
  onDragOverPage: (pageId: string, event: ReactDragEvent<HTMLElement>) => void
  onSelectPage: (pageId: string, modifiers: { extend: boolean; toggle: boolean }) => void
  onReorder: (activeId: string, overId: string) => void
  onRename: (pageId: string, label: string) => void
  onInspectPage: (pageId: string) => void
  onViewPage: (pageId: string) => void
  onUngroupPage?: (pageId: string) => void
}

function PageCard({
  page,
  index,
  pages,
  sourcePdf,
  pdfs,
  isSelected,
  isBeingDragged,
  getDragPages,
  getDragFilename,
  onDragStart,
  onDragEnd,
  onDragOverPage,
  onSelectPage,
  onReorder,
  onRename,
  onInspectPage,
  onViewPage,
  onUngroupPage,
}: PageCardProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftLabel, setDraftLabel] = useState(page.label ?? '')
  const isDragging = isBeingDragged

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (isDragging || event.target !== event.currentTarget) return

    if (event.key === 'F2' || event.key === 'Enter') {
      event.preventDefault()
      beginRename()
      return
    }

    const direction =
      event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? -1
        : event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? 1
          : 0
    const targetPage = pages[index + direction]
    if (direction === 0 || !targetPage) return

    event.preventDefault()
    onReorder(page.id, targetPage.id)
  }

  const handleSelectClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    onInspectPage(page.id)
    onSelectPage(page.id, { extend: false, toggle: true })
  }

  const handleCardClick = (event: ReactMouseEvent<HTMLElement>) => {
    onInspectPage(page.id)
    onSelectPage(page.id, {
      extend: event.shiftKey,
      toggle: event.ctrlKey || event.metaKey,
    })
  }

  const beginRename = () => {
    setDraftLabel(page.label || displayName(page.sourcePdfName))
    setIsRenaming(true)
  }
  const cardRef = useRenameRequest(beginRename)

  const finishRename = () => {
    // Left untouched, the prefilled default name must not become a custom label.
    const label = !page.label && draftLabel.trim() === displayName(page.sourcePdfName) ? '' : draftLabel.trim()
    onRename(page.id, label)
    const dragPages = getDragPages(page.id)
    if (dragPages.length === 1) {
      prepareDragOut(
        dragPages.map((dragPage) =>
          dragPage.id === page.id ? { ...dragPage, label: label || undefined } : dragPage,
        ),
        pdfs,
      )
    }
    setIsRenaming(false)
  }

  const cancelRename = () => {
    setDraftLabel(page.label ?? '')
    setIsRenaming(false)
  }

  return (
    <article
      ref={cardRef}
      className={`page-card${isDragging ? ' is-dragging' : ''}${isSelected ? ' is-selected' : ''}`}
      tabIndex={0}
      draggable
      onPointerEnter={() => {
        const dragPages = getDragPages(page.id)
        prepareDragOut(dragPages, pdfs, getDragFilename(dragPages))
      }}
      onPointerDown={() => {
        const dragPages = getDragPages(page.id)
        prepareDragOut(dragPages, pdfs, getDragFilename(dragPages))
      }}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copyMove'
        event.dataTransfer.setData('text/plain', page.id)
        // Lets the same drag also drop as a file on the desktop or a folder.
        const dragPages = getDragPages(page.id)
        setLiftedDragImage(event, event.currentTarget, dragPages.length)
        const payload = readyDragOutPayload(dragPages, getDragFilename(dragPages))
        if (payload) event.dataTransfer.setData('DownloadURL', payload)
        onDragStart(page.id, grabFrom(event))
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => onDragOverPage(page.id, event)}
      onKeyDown={handleKeyDown}
      onClick={handleCardClick}
      onDoubleClick={(event) => {
        // Double-clicking inside the rename box selects a word; it should not open the viewer.
        if (event.target instanceof HTMLElement && event.target.closest('input, button')) return
        onViewPage(page.id)
      }}
      data-page-id={page.id}
      data-page-ids={page.id}
      aria-label={`Page ${page.pageNumber} from ${displayName(page.sourcePdfName)}${isSelected ? ', selected' : ''}. Use arrow keys to reorder.`}
    >
      <button
        type="button"
        className={`page-select-toggle${isSelected ? ' is-selected' : ''}`}
        aria-label={isSelected ? `Deselect page ${page.pageNumber}` : `Select page ${page.pageNumber}`}
        aria-pressed={isSelected}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={handleSelectClick}
      >
        {isSelected && <span className="page-select-check">✓</span>}
      </button>
      <PageThumbnail
        sourcePdfId={page.sourcePdfId}
        sourcePdfName={page.sourcePdfName}
        file={sourcePdf.file}
        pageNumber={page.pageNumber}
        rotation={page.rotation}
        textOverlay={page.textBoxes ? { boxes: page.textBoxes, page } : undefined}
        onExpand={() => onViewPage(page.id)}
      >
        <span className="page-number-badge">{page.pageNumber}</span>
      </PageThumbnail>
      {onUngroupPage && page.groupId && (
        <button
          type="button"
          className="page-ungroup-button"
          aria-label={`Remove page ${page.pageNumber} from group`}
          title="Remove from group"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onUngroupPage(page.id)
          }}
        >
          <Minus size={15} aria-hidden="true" />
        </button>
      )}
      <div className="page-metadata">
        <div className="page-source" title={page.sourcePdfName}>
          <span>Page {page.pageNumber}</span>
          {isRenaming ? (
            <input
              className="page-label-input"
              value={draftLabel}
              autoFocus
              aria-label={`Page ${page.pageNumber} label`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onFocus={(event) => event.target.select()}
              onChange={(event) => setDraftLabel(event.target.value)}
              onBlur={finishRename}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Enter') finishRename()
                if (event.key === 'Escape') cancelRename()
              }}
            />
          ) : (
            <strong
              className="page-name"
              title="Double-click to rename"
              onDoubleClick={(event) => {
                event.stopPropagation()
                beginRename()
              }}
            >
              {page.label || displayName(page.sourcePdfName)}
            </strong>
          )}
        </div>
        {isRenaming ? (
          <div className="page-label-actions">
            <button type="button" aria-label="Save page label" onPointerDown={(event) => { event.stopPropagation(); event.preventDefault() }} onClick={(event) => { event.stopPropagation(); finishRename() }}>
              <Check size={13} />
            </button>
            <button type="button" aria-label="Cancel page label edit" onPointerDown={(event) => { event.stopPropagation(); event.preventDefault() }} onClick={(event) => { event.stopPropagation(); cancelRename() }}>
              <X size={13} />
            </button>
          </div>
        ) : (
          <button
            className="page-rename-button"
            type="button"
            aria-label={`Rename page ${page.pageNumber}`}
            title="Rename (F2)"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              beginRename()
            }}
          >
            <Pencil size={13} />
          </button>
        )}
      </div>
    </article>
  )
}

export function PageGrid({
  pages,
  allPages,
  groups,
  pdfs,
  isProcessing,
  selectedPageIds,
  thumbnailSize,
  searchQuery,
  onSetSelection,
  onReorder,
  onRename,
  onRenameGroup,
  onInspectPage,
  onViewPage,
  onOpenGroup,
  onOpenContextMenu,
  expandedGroupId,
  groupCanvasName,
  onUngroupPage,
  animateArrivals: shouldAnimateArrivals = false,
}: PageGridProps) {
  const sourcePdfById = useMemo(
    () => new Map(pdfs.map((pdf) => [pdf.id, pdf])),
    [pdfs],
  )
  const selectedSet = useMemo(
    () => new Set(selectedPageIds),
    [selectedPageIds],
  )
  const gridItems = useMemo(() => {
    const groupsById = new Map(groups.map((group) => [group.id, group]))
    // One pass over every page, so large documents do not pay for a search per page.
    const indexById = new Map<string, number>()
    const membersByGroup = new Map<string, PdfPage[]>()
    allPages.forEach((item, index) => {
      indexById.set(item.id, index)
      if (item.groupId) {
        const members = membersByGroup.get(item.groupId)
        if (members) members.push(item)
        else membersByGroup.set(item.groupId, [item])
      }
    })
    const emittedGroups = new Set<string>()
    const items: Array<
      | { type: 'page'; page: PdfPage; index: number }
      | { type: 'group'; group: PageGroup; pages: PdfPage[]; index: number }
    > = []
    for (const page of pages) {
      const group = page.groupId && !expandedGroupId ? groupsById.get(page.groupId) : undefined
      if (!group) {
        items.push({ type: 'page', page, index: indexById.get(page.id) ?? -1 })
        continue
      }
      if (emittedGroups.has(group.id)) continue
      emittedGroups.add(group.id)
      const members = membersByGroup.get(group.id) ?? []
      if (members.length > 0) {
        items.push({ type: 'group', group, pages: members, index: indexById.get(members[0].id) ?? -1 })
      }
    }
    return items
  }, [allPages, expandedGroupId, groups, pages])
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [hoverSlot, setHoverSlot] = useState<string | null>(null)
  const hoverSlotRef = useRef<string | null>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const cardPositionsRef = useRef(new Map<string, { x: number; y: number }>())
  const getDragPages = (pageId: string) =>
    selectedSet.has(pageId) && selectedSet.size > 1
      ? allPages.filter((page) => selectedSet.has(page.id))
      : allPages.filter((page) => page.id === pageId)
  const getDragFilename = (dragPages: PdfPage[]) =>
    groupCanvasName &&
    dragPages.length === pages.length &&
    dragPages.every((page) => pages.some((item) => item.id === page.id))
      ? groupCanvasName
      : undefined
  const getGroupDragFiles = (dragPages: PdfPage[], group: PageGroup): DragOutFileRequest[] => {
    const includesOtherPages = dragPages.some((page) => page.groupId !== group.id)
    if (!includesOtherPages) return [{ pages: dragPages, filename: group.name }]

    const selectedIds = new Set(dragPages.map((page) => page.id))
    const emittedGroups = new Set<string>()
    const files: DragOutFileRequest[] = []
    for (const page of dragPages) {
      if (!page.groupId) {
        files.push({ pages: [page] })
        continue
      }
      const selectedGroup = groups.find((item) => item.id === page.groupId)
      const members = allPages.filter((item) => item.groupId === page.groupId)
      if (
        selectedGroup &&
        members.length > 0 &&
        members.every((member) => selectedIds.has(member.id))
      ) {
        if (!emittedGroups.has(selectedGroup.id)) {
          emittedGroups.add(selectedGroup.id)
          files.push({ pages: members, filename: selectedGroup.name })
        }
        continue
      }
      files.push({ pages: [page] })
    }
    return files
  }
  const selectionAnchorId = useRef<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const gridWindow = useGridWindow(gridRef, gridItems.length, pages.length > 0, thumbnailSize)
  const marqueeStartRef = useRef<{ x: number; y: number; additive: boolean } | null>(null)
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  const selectPages = (
    pageIds: string[],
    modifiers: { extend: boolean; toggle: boolean },
  ) => {
    if (pageIds.length === 0) return
    const selectionPages = expandedGroupId ? pages : allPages
    const anchorId = selectionAnchorId.current
    if (modifiers.extend && anchorId) {
      const anchorIndex = selectionPages.findIndex((page) => page.id === anchorId)
      const memberIndexes = pageIds.map((id) => selectionPages.findIndex((page) => page.id === id))
      if (anchorIndex >= 0 && memberIndexes.every((index) => index >= 0)) {
        const [start, end] = [anchorIndex, ...memberIndexes].reduce<[number, number]>(
          ([low, high], index) => [Math.min(low, index), Math.max(high, index)],
          [anchorIndex, anchorIndex],
        )
        const range = selectionPages.slice(start, end + 1).map((page) => page.id)
        onSetSelection(modifiers.toggle ? [...selectedPageIds, ...range] : range)
        return
      }
    }
    selectionAnchorId.current = pageIds[0]
    if (modifiers.toggle) {
      const allSelected = pageIds.every((id) => selectedSet.has(id))
      onSetSelection(
        allSelected
          ? selectedPageIds.filter((id) => !pageIds.includes(id))
          : [...selectedPageIds, ...pageIds],
      )
    } else {
      onSetSelection(pageIds)
    }
  }

  const selectPage = (pageId: string, modifiers: { extend: boolean; toggle: boolean }) =>
    selectPages([pageId], modifiers)

  const handleGridPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    marqueeStartRef.current = { x, y, additive: event.shiftKey }
    event.currentTarget.setPointerCapture(event.pointerId)
    setMarquee({ left: x, top: y, width: 0, height: 0 })
  }

  const handleGridPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!marqueeStartRef.current || !gridRef.current) return
    const bounds = gridRef.current.getBoundingClientRect()
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    const start = marqueeStartRef.current
    setMarquee({
      left: Math.min(start.x, x),
      top: Math.min(start.y, y),
      width: Math.abs(x - start.x),
      height: Math.abs(y - start.y),
    })
  }

  const handleGridPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = marqueeStartRef.current
    const grid = gridRef.current
    if (!start || !grid) return

    const bounds = grid.getBoundingClientRect()
    const endX = event.clientX - bounds.left
    const endY = event.clientY - bounds.top
    const selectionInGrid = {
      left: Math.min(start.x, endX),
      right: Math.max(start.x, endX),
      top: Math.min(start.y, endY),
      bottom: Math.max(start.y, endY),
    }
    const overlaps = (rect: { left: number; top: number; width: number; height: number }) =>
      rect.left < selectionInGrid.right &&
      rect.left + rect.width > selectionInGrid.left &&
      rect.top < selectionInGrid.bottom &&
      rect.top + rect.height > selectionInGrid.top
    const idsOf = (item: (typeof gridItems)[number]) =>
      item.type === 'group' ? item.pages.map((page) => page.id) : [item.page.id]
    // With windowing, off-screen cards have no DOM, so every card is hit-tested from the grid's row and column layout.
    const selectedIds = gridWindow.enabled
      ? gridItems.flatMap((item, index) => (overlaps(gridWindow.getItemRect(index)) ? idsOf(item) : []))
      : Array.from(grid.querySelectorAll<HTMLElement>('[data-page-ids]'))
          .filter((card) => {
            const cardRect = card.getBoundingClientRect()
            return overlaps({
              left: cardRect.left - bounds.left,
              top: cardRect.top - bounds.top,
              width: cardRect.width,
              height: cardRect.height,
            })
          })
          .flatMap((card) => card.dataset.pageIds?.split(' ') ?? [])
          .filter(Boolean)

    onSetSelection(start.additive ? [...selectedPageIds, ...selectedIds] : selectedIds)
    if (selectedIds.length > 0) {
      selectionAnchorId.current = selectedIds[selectedIds.length - 1]
    }
    marqueeStartRef.current = null
    setMarquee(null)
  }

  const handleGridPointerCancel = () => {
    marqueeStartRef.current = null
    setMarquee(null)
  }

  const handleGridContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const card = target.closest<HTMLElement>('[data-page-ids]')
    if (!card) return
    event.preventDefault()

    const pageIds = card.dataset.pageIds?.split(' ').filter(Boolean) ?? []
    if (pageIds.length === 0) return
    const selectionIncludesCard = pageIds.every((pageId) => selectedSet.has(pageId))
    const contextPageIds = selectionIncludesCard ? selectedPageIds : pageIds
    if (!selectionIncludesCard) onSetSelection(pageIds)
    onOpenContextMenu(contextPageIds, card.dataset.groupId, {
      x: event.clientX,
      y: event.clientY,
    })
  }

  const updateHoverSlot = (slot: string | null) => {
    hoverSlotRef.current = slot
    setHoverSlot(slot)
  }

  const draggingIdRef = useRef<string | null>(null)
  const grabRef = useRef<DragGrab | null>(null)
  // Set when a drag ends, and used once by the layout effect to animate the card from where it was let go.
  const releaseRef = useRef<(DragRelease & { collapse: boolean; origin: DragGrab['preview'] }) | null>(null)

  const startDrag = (pageId: string, grab: DragGrab) => {
    draggingIdRef.current = pageId
    grabRef.current = grab
    releaseRef.current = null
    setDraggingId(pageId)
  }

  // A drag that ends without a drop (Esc, or let go off the grid) flies back from where it was released.
  const endDrag = (event?: { clientX: number; clientY: number }) => {
    const id = draggingIdRef.current
    if (!id) return
    draggingIdRef.current = null
    const grab = grabRef.current
    const insideWindow =
      event !== undefined &&
      (event.clientX !== 0 || event.clientY !== 0) &&
      event.clientX >= 0 &&
      event.clientY >= 0 &&
      event.clientX <= window.innerWidth &&
      event.clientY <= window.innerHeight
    if (!releaseRef.current && grab && insideWindow) {
      releaseRef.current = {
        id,
        left: event.clientX - grab.x,
        top: event.clientY - grab.y,
        collapse: false,
        origin: grab.preview,
      }
    }
    updateHoverSlot(null)
    setDraggingId(null)
  }

  // While dragging, only an insertion bar marks the spot; the cards rearrange once the page is released.
  const handleDragOverPage = (pageId: string, event: ReactDragEvent<HTMLElement>) => {
    if (!draggingId) return
    if (pageId === draggingId) {
      updateHoverSlot(null)
      return
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    const isAfter = event.clientX > bounds.left + bounds.width / 2
    const slot = `${pageId}|${isAfter ? 'after' : 'before'}`
    if (slot !== hoverSlotRef.current) updateHoverSlot(slot)
  }

  const handleGridDragOver = (event: ReactDragEvent<HTMLElement>) => {
    if (!draggingId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const handleGridDrop = (event: ReactDragEvent<HTMLElement>) => {
    if (!draggingId) return
    event.preventDefault()
    event.stopPropagation()
    let moved = false
    if (hoverSlot && !slotChangesNothing(gridItems, hoverSlot, draggingId)) {
      const [overId, side] = hoverSlot.split('|') as [string, DropSide]
      onReorder(draggingId, overId, side)
      moved = true
    }
    const grab = grabRef.current
    if (grab) {
      releaseRef.current = {
        id: draggingId,
        left: event.clientX - grab.x,
        top: event.clientY - grab.y,
        collapse: moved,
        origin: grab.preview,
      }
    }
    endDrag()
  }

  // FLIP: cards jump to their new layout slot, then animate from where they were.
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const gridBounds = grid.getBoundingClientRect()
    const previous = cardPositionsRef.current
    const next = new Map<string, { x: number; y: number }>()
    const boundsById = new Map<string, DOMRect>()
    const canAnimate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches

    grid.querySelectorAll<HTMLElement>('[data-page-id]').forEach((card) => {
      const id = card.dataset.pageId
      if (!id) return
      const bounds = card.getBoundingClientRect()
      boundsById.set(id, bounds)
      const position = { x: bounds.left - gridBounds.left, y: bounds.top - gridBounds.top }
      next.set(id, position)
      const before = previous.get(id)
      // The card that was just dragged lands from the release point instead (see below).
      if (!canAnimate || !before || id === releaseRef.current?.id) return
      const dx = before.x - position.x
      const dy = before.y - position.y
      const isNearViewport = bounds.bottom > -200 && bounds.top < window.innerHeight + 200
      if ((Math.abs(dx) < 1 && Math.abs(dy) < 1) || !isNearViewport) return
      card.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: REARRANGE_ANIMATION_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      )
    })
    cardPositionsRef.current = next

    const release = releaseRef.current
    if (release && canAnimate) {
      releaseRef.current = null
      const landed = boundsById.has(release.id)
        ? grid.querySelector<HTMLElement>(`[data-page-id="${CSS.escape(release.id)}"]`)
        : null
      if (landed) landDraggedCard(landed, release)
      if (release.collapse) collapseSkeleton(release.origin)
    }

    // Cards beside the bar step aside a little, so the gap is felt as well as seen. Only a card's contents move: the card
    // box stays put, so what is under the pointer and what the reorder animation measures never change mid-drag.
    const nudgeTargets = (card: HTMLElement) =>
      Array.from(card.querySelectorAll<HTMLElement>(':scope > .page-preview, :scope > .page-metadata'))
    grid.querySelectorAll<HTMLElement>('[data-nudged]').forEach((card) => {
      nudgeTargets(card).forEach((element) => {
        element.style.translate = ''
      })
      card.removeAttribute('data-nudged')
    })

    // The bar sits centred in the gap on one side of the hovered card.
    const indicator = indicatorRef.current
    if (!indicator) return
    const hovered = hoverSlot?.split('|') as [string, DropSide] | undefined
    const bounds = hovered ? boundsById.get(hovered[0]) : undefined
    if (!hovered || !bounds) {
      indicator.classList.remove('is-visible')
      return
    }

    // Dropping beside the dragged card's own spot changes nothing, so no bar is shown there.
    if (slotChangesNothing(gridItems, hoverSlot ?? '', draggingId)) {
      indicator.classList.remove('is-visible')
      return
    }

    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0
    const thickness = 4
    const along =
      (hovered[1] === 'after' ? bounds.right - gridBounds.left + gap / 2 : bounds.left - gridBounds.left - gap / 2) -
      thickness / 2
    const wasVisible = indicator.classList.contains('is-visible')
    indicator.style.width = `${thickness}px`
    indicator.style.height = `${bounds.height}px`
    indicator.style.transform = `translate(${along}px, ${bounds.top - gridBounds.top}px)`
    // A bar that was hidden appears in place; only a visible bar slides between slots.
    if (!wasVisible) {
      void indicator.offsetWidth
      indicator.classList.add('is-visible')
    }

    const isCard = (element: Element | null): element is HTMLElement =>
      element instanceof HTMLElement && element.dataset.pageIds !== undefined
    const sibling = (card: HTMLElement, direction: 'next' | 'previous') => {
      let element = direction === 'next' ? card.nextElementSibling : card.previousElementSibling
      while (element && !isCard(element)) {
        element = direction === 'next' ? element.nextElementSibling : element.previousElementSibling
      }
      return element
    }
    const hoveredCard = grid.querySelector<HTMLElement>(`[data-page-id="${CSS.escape(hovered[0])}"]`)

    if (canAnimate) {
      const nudge = (card: HTMLElement | null | undefined, distance: number) => {
        // Only cards in the same row share the gap the bar sits in.
        if (!card || Math.abs(card.getBoundingClientRect().top - bounds.top) > 4) return
        nudgeTargets(card).forEach((element) => {
          element.style.translate = `${distance}px 0`
        })
        card.setAttribute('data-nudged', '')
      }
      if (hoveredCard) {
        const after = hovered[1] === 'after'
        nudge(hoveredCard, after ? -NUDGE_PX : NUDGE_PX)
        const neighbour = sibling(hoveredCard, after ? 'next' : 'previous')
        if (isCard(neighbour) && neighbour.dataset.pageId !== draggingId) nudge(neighbour, after ? NUDGE_PX : -NUDGE_PX)
      }
    }
  }, [gridItems, draggingId, hoverSlot, gridWindow.startIndex, gridWindow.endIndex])

  // Pages that were not in the workspace a moment ago drop in. The first pass after loading only records what is there.
  const knownPageIdsRef = useRef(new Set<string>())
  const arrivalsWereEnabledRef = useRef(false)
  useLayoutEffect(() => {
    const arrived = new Set<string>()
    for (const page of allPages) if (!knownPageIdsRef.current.has(page.id)) arrived.add(page.id)
    const shouldAnimate = shouldAnimateArrivals && arrivalsWereEnabledRef.current && arrived.size > 0
    knownPageIdsRef.current = new Set(allPages.map((page) => page.id))
    arrivalsWereEnabledRef.current = shouldAnimateArrivals
    if (shouldAnimate && gridRef.current) animateArrivals(gridRef.current, arrived)
  }, [allPages, shouldAnimateArrivals])

  // A card scrolled out of the rendered window is unmounted mid-drag and never fires its own dragend.
  useEffect(() => {
    if (!draggingId) return
    const finish = (event: Event) => {
      const { clientX, clientY } = event as DragEvent
      window.setTimeout(() => endDrag({ clientX, clientY }), 0)
    }
    window.addEventListener('dragend', finish)
    window.addEventListener('drop', finish)
    return () => {
      window.removeEventListener('dragend', finish)
      window.removeEventListener('drop', finish)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId])

  useEffect(() => {
    const forgetPositions = () => cardPositionsRef.current.clear()
    window.addEventListener('resize', forgetPositions)
    return () => {
      window.removeEventListener('resize', forgetPositions)
    }
  }, [])

  if (pages.length > 0) {
    return (
          <div
            ref={gridRef}
            className={`page-grid view-grid${marquee ? ' is-marquee-selecting' : ''}${gridWindow.enabled ? ' is-windowed' : ''}`}
            style={{
              '--page-card-min-width': `${174 * thumbnailSize / 100}px`,
              '--page-preview-height': `${224 * thumbnailSize / 100}px`,
              ...(gridWindow.enabled
                ? {
                    gridAutoRows: `${gridWindow.rowHeight}px`,
                    paddingTop: `calc(var(--grid-pad-top) + ${gridWindow.paddingTop}px)`,
                    paddingBottom: gridWindow.paddingBottom,
                  }
                : null),
            } as CSSProperties}
            aria-label="Document pages"
            onPointerDown={handleGridPointerDown}
            onPointerMove={handleGridPointerMove}
            onPointerUp={handleGridPointerUp}
            onPointerCancel={handleGridPointerCancel}
            onDragOver={handleGridDragOver}
            onDrop={handleGridDrop}
            onContextMenu={handleGridContextMenu}
          >
            <div ref={indicatorRef} className="drop-indicator" aria-hidden="true" />
            {marquee && (
              <div
                className="selection-marquee"
                style={{
                  left: marquee.left,
                  top: marquee.top,
                  width: marquee.width,
                  height: marquee.height,
                }}
                aria-hidden="true"
              />
            )}
            {gridItems.slice(gridWindow.startIndex, gridWindow.endIndex).map((item) => {
              if (item.type === 'group') {
                const cover = item.pages[0]
                const sourcePdf = sourcePdfById.get(cover.sourcePdfId)
                if (!sourcePdf) return null
                const isGroupSelected = item.pages.every((page) => selectedSet.has(page.id))
                const isOnlyGroupSelected =
                  isGroupSelected && selectedSet.size === item.pages.length
                const dragPages =
                  isGroupSelected && !isOnlyGroupSelected
                    ? allPages.filter((page) => selectedSet.has(page.id))
                    : item.pages
                const dragOutFiles =
                  isGroupSelected && !isOnlyGroupSelected
                    ? getGroupDragFiles(dragPages, item.group)
                    : [{ pages: item.pages, filename: item.group.name }]
                return (
                  <GroupCard
                    key={`group-${item.group.id}`}
                    group={item.group}
                    pages={item.pages}
                    dragOutFiles={dragOutFiles}
                    sourcePdf={sourcePdf}
                    pdfs={pdfs}
                    isSelected={isGroupSelected}
                    isBeingDragged={draggingId === cover.id}
                    onSelect={(modifiers) => selectPages(item.pages.map((page) => page.id), modifiers)}
                    onDragStart={startDrag}
                    onDragEnd={endDrag}
                    onDragOverPage={handleDragOverPage}
                    onRename={onRenameGroup}
                    onInspectPage={onInspectPage}
                    onViewPage={onViewPage}
                    onOpenGroup={onOpenGroup}
                  />
                )
              }
              const { page, index } = item
              const sourcePdf = sourcePdfById.get(page.sourcePdfId)
              if (!sourcePdf) return null
              return (
                <PageCard
                  key={page.id}
                  page={page}
                  index={index}
                  pages={allPages}
                  sourcePdf={sourcePdf}
                  pdfs={pdfs}
                  getDragPages={getDragPages}
                  getDragFilename={getDragFilename}
                  isBeingDragged={draggingId === page.id}
                  onDragStart={startDrag}
                  onDragEnd={endDrag}
                  onDragOverPage={handleDragOverPage}
                  isSelected={selectedSet.has(page.id)}
                  onSelectPage={selectPage}
                  onReorder={onReorder}
                  onRename={onRename}
                  onInspectPage={onInspectPage}
                  onViewPage={onViewPage}
                  onUngroupPage={onUngroupPage}
                />
              )
            })}
            {isProcessing && gridWindow.endIndex >= gridItems.length && (
              <div className="loading-state" role="status">
                <span className="loading-spinner" />
                <span>Preparing more pages…</span>
              </div>
            )}
          </div>
    )
  }

  if (isProcessing) {
    return (
      <div className="empty-state" role="status">
        <span className="loading-spinner" />
        <strong>Preparing your pages</strong>
        <span>PDFs and images are processed locally in your browser.</span>
      </div>
    )
  }

  return (
    <div className="empty-state">
      <span className="empty-icon">
        <FileText size={20} strokeWidth={1.7} />
      </span>
      {searchQuery ? (
        <>
          <strong>No matching pages</strong>
          <span>Try another page number, label, source filename, title, or author.</span>
        </>
      ) : (
        <>
          <strong>A little space to get started</strong>
          <span>Add PDFs or images above to see every page at a glance.</span>
        </>
      )}
    </div>
  )
}
