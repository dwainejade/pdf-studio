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
import { Check, FileText, Pencil, X } from 'lucide-react'
import type { PdfPage, UploadedPdf } from '../../types/pdf'
import { PageThumbnail } from './PageThumbnail'
import { prepareDragOut, readyDragOutPayload } from '../../lib/export/dragOut'

const REARRANGE_ANIMATION_MS = 220

type DropSide = 'before' | 'after'

interface PageGridProps {
  pages: PdfPage[]
  pdfs: UploadedPdf[]
  isProcessing: boolean
  selectedPageIds: string[]
  thumbnailSize: number
  searchQuery: string
  onToggleSelection: (pageId: string) => void
  onSetSelection: (pageIds: string[]) => void
  onReorder: (activeId: string, overId: string, side?: DropSide) => void
  onRename: (pageId: string, label: string) => void
  onInspectPage: (pageId: string) => void
  onViewPage: (pageId: string) => void
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
  onDragStart: (pageId: string) => void
  onDragEnd: () => void
  onDragOverPage: (pageId: string, event: ReactDragEvent<HTMLElement>) => void
  onSelectPage: (pageId: string, modifiers: { extend: boolean; toggle: boolean }) => void
  onReorder: (activeId: string, overId: string) => void
  onRename: (pageId: string, label: string) => void
  onInspectPage: (pageId: string) => void
  onViewPage: (pageId: string) => void
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
  onDragStart,
  onDragEnd,
  onDragOverPage,
  onSelectPage,
  onReorder,
  onRename,
  onInspectPage,
  onViewPage,
}: PageCardProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftLabel, setDraftLabel] = useState(page.label ?? '')
  const isDragging = isBeingDragged

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (isDragging || event.target !== event.currentTarget) return

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

  const beginRename = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setDraftLabel(page.label || page.sourcePdfName)
    setIsRenaming(true)
  }

  const finishRename = () => {
    // Left untouched, the prefilled default name must not become a custom label.
    onRename(page.id, !page.label && draftLabel === page.sourcePdfName ? '' : draftLabel)
    setIsRenaming(false)
  }

  const cancelRename = () => {
    setDraftLabel(page.label ?? '')
    setIsRenaming(false)
  }

  return (
    <article
      className={`page-card${isDragging ? ' is-dragging' : ''}${isSelected ? ' is-selected' : ''}`}
      tabIndex={0}
      draggable
      onPointerEnter={() => prepareDragOut(getDragPages(page.id), pdfs)}
      onPointerDown={() => prepareDragOut(getDragPages(page.id), pdfs)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copyMove'
        event.dataTransfer.setData('text/plain', page.id)
        // Lets the same drag also drop as a file on the desktop or a folder.
        const payload = readyDragOutPayload(getDragPages(page.id))
        if (payload) event.dataTransfer.setData('DownloadURL', payload)
        onDragStart(page.id)
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => onDragOverPage(page.id, event)}
      onKeyDown={handleKeyDown}
      onClick={handleCardClick}
      data-page-id={page.id}
      aria-label={`Page ${page.pageNumber} from ${page.sourcePdfName}${isSelected ? ', selected' : ''}. Use arrow keys to reorder.`}
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
        onExpand={() => onViewPage(page.id)}
      >
        <span className="page-number-badge">{page.pageNumber}</span>
      </PageThumbnail>
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
            <strong>{page.label || page.sourcePdfName}</strong>
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
            onPointerDown={(event) => event.stopPropagation()}
            onClick={beginRename}
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
  pdfs,
  isProcessing,
  selectedPageIds,
  thumbnailSize,
  searchQuery,
  onToggleSelection,
  onSetSelection,
  onReorder,
  onRename,
  onInspectPage,
  onViewPage,
}: PageGridProps) {
  const sourcePdfById = useMemo(
    () => new Map(pdfs.map((pdf) => [pdf.id, pdf])),
    [pdfs],
  )
  const selectedSet = useMemo(
    () => new Set(selectedPageIds),
    [selectedPageIds],
  )
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [hoverSlot, setHoverSlot] = useState<string | null>(null)
  const hoverSlotRef = useRef<string | null>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const cardPositionsRef = useRef(new Map<string, { x: number; y: number }>())
  const getDragPages = (pageId: string) =>
    selectedSet.has(pageId) && selectedSet.size > 1
      ? pages.filter((page) => selectedSet.has(page.id))
      : pages.filter((page) => page.id === pageId)
  const selectionAnchorId = useRef<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const marqueeStartRef = useRef<{ x: number; y: number; additive: boolean } | null>(null)
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  const selectPage = (
    pageId: string,
    modifiers: { extend: boolean; toggle: boolean },
  ) => {
    const anchorId = selectionAnchorId.current
    if (modifiers.extend && anchorId) {
      const anchorIndex = pages.findIndex((page) => page.id === anchorId)
      const pageIndex = pages.findIndex((page) => page.id === pageId)
      if (anchorIndex >= 0 && pageIndex >= 0) {
        const [start, end] = [anchorIndex, pageIndex].sort((a, b) => a - b)
        const range = pages.slice(start, end + 1).map((page) => page.id)
        onSetSelection(modifiers.toggle ? [...selectedPageIds, ...range] : range)
        return
      }
    }
    selectionAnchorId.current = pageId
    if (modifiers.toggle) onToggleSelection(pageId)
    else onSetSelection([pageId])
  }

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
    const selectionRect = {
      left: Math.min(start.x, endX) + bounds.left,
      right: Math.max(start.x, endX) + bounds.left,
      top: Math.min(start.y, endY) + bounds.top,
      bottom: Math.max(start.y, endY) + bounds.top,
    }
    const selectedIds = Array.from(grid.querySelectorAll<HTMLElement>('[data-page-id]'))
      .filter((card) => {
        const cardRect = card.getBoundingClientRect()
        return (
          cardRect.left < selectionRect.right &&
          cardRect.right > selectionRect.left &&
          cardRect.top < selectionRect.bottom &&
          cardRect.bottom > selectionRect.top
        )
      })
      .map((card) => card.dataset.pageId)
      .filter((id): id is string => id !== undefined)

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

  const updateHoverSlot = (slot: string | null) => {
    hoverSlotRef.current = slot
    setHoverSlot(slot)
  }

  const startDrag = (pageId: string) => {
    setDraggingId(pageId)
  }

  const endDrag = () => {
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
    if (hoverSlot) {
      const [overId, side] = hoverSlot.split('|') as [string, DropSide]
      onReorder(draggingId, overId, side)
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
      if (!canAnimate || !before) return
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

    // The bar sits centred in the gap on one side of the hovered card.
    const indicator = indicatorRef.current
    if (!indicator) return
    const hovered = hoverSlot?.split('|') as [string, DropSide] | undefined
    const bounds = hovered ? boundsById.get(hovered[0]) : undefined
    if (!hovered || !bounds) {
      indicator.style.opacity = '0'
      return
    }
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0
    const thickness = 4
    const along =
      (hovered[1] === 'after' ? bounds.right - gridBounds.left + gap / 2 : bounds.left - gridBounds.left - gap / 2) -
      thickness / 2
    indicator.style.width = `${thickness}px`
    indicator.style.height = `${bounds.height}px`
    indicator.style.transform = `translate(${along}px, ${bounds.top - gridBounds.top}px)`
    indicator.style.opacity = '1'
  }, [pages, draggingId, hoverSlot])

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
            className={`page-grid view-grid${marquee ? ' is-marquee-selecting' : ''}`}
            style={{
              '--page-card-min-width': `${174 * thumbnailSize / 100}px`,
              '--page-preview-height': `${224 * thumbnailSize / 100}px`,
            } as CSSProperties}
            aria-label="PDF pages"
            onPointerDown={handleGridPointerDown}
            onPointerMove={handleGridPointerMove}
            onPointerUp={handleGridPointerUp}
            onPointerCancel={handleGridPointerCancel}
            onDragOver={handleGridDragOver}
            onDrop={handleGridDrop}
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
            {pages.map((page, index) => {
              const sourcePdf = sourcePdfById.get(page.sourcePdfId)
              if (!sourcePdf) return null
              return (
                <PageCard
                  key={page.id}
                  page={page}
                  index={index}
                  pages={pages}
                  sourcePdf={sourcePdf}
                  pdfs={pdfs}
                  getDragPages={getDragPages}
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
                />
              )
            })}
            {isProcessing && (
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
        <span>PDFs are processed locally in your browser.</span>
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
          <span>Add one or more PDFs above to see every page at a glance.</span>
        </>
      )}
    </div>
  )
}
