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
import { Check, FileText, Pencil, RotateCw, Trash2, X } from 'lucide-react'
import type { PdfPage, UploadedPdf } from '../../types/pdf'
import type { PageViewMode } from '../../store/viewPreferences'
import { individualFilename } from '../../lib/export/filenames'
import { PageThumbnail } from './PageThumbnail'
import { prepareDragOut, readyDragOutPayload } from '../../lib/export/dragOut'

const REARRANGE_DWELL_MS = 2000
const POINTER_MOVE_TOLERANCE_PX = 8
const REARRANGE_ANIMATION_MS = 220

type DropSide = 'before' | 'after'

function placeItem(order: string[], activeId: string, overId: string, side: DropSide): string[] {
  if (activeId === overId) return order
  const next = order.filter((id) => id !== activeId)
  const overIndex = next.indexOf(overId)
  if (overIndex < 0) return order
  next.splice(side === 'after' ? overIndex + 1 : overIndex, 0, activeId)
  return next
}

interface PageGridProps {
  pages: PdfPage[]
  pdfs: UploadedPdf[]
  isProcessing: boolean
  selectedPageIds: string[]
  viewMode: PageViewMode
  thumbnailSize: number
  searchQuery: string
  onToggleSelection: (pageId: string) => void
  onSetSelection: (pageIds: string[]) => void
  onReorder: (activeId: string, overId: string, side?: DropSide) => void
  onRename: (pageId: string, label: string) => void
  onInspectPage: (pageId: string) => void
  onViewPage: (pageId: string) => void
  onRotatePage: (pageId: string) => void
  onDeletePage: (pageId: string) => void
}

interface PageCardProps {
  page: PdfPage
  index: number
  pages: PdfPage[]
  sourcePdf: UploadedPdf
  pdfs: UploadedPdf[]
  isSelected: boolean
  viewMode: PageViewMode
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
  onRotatePage: (pageId: string) => void
  onDeletePage: (pageId: string) => void
}

function PageCard({
  page,
  index,
  pages,
  sourcePdf,
  pdfs,
  isSelected,
  viewMode,
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
  onRotatePage,
  onDeletePage,
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

  const stopCardAction = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
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
      />
      <div className={`page-metadata${viewMode === 'detail' ? ' detail-page-info' : ''}`}>
        <span className="page-number">{page.pageNumber}</span>
        <div className="page-source" title={page.sourcePdfName}>
          <span>Page {page.pageNumber}</span>
          {viewMode === 'detail' && page.label && (
            <span className="detail-page-label">Label: {page.label}</span>
          )}
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
          {viewMode === 'detail' && (
            <span className="detail-source-label">Source: {page.sourcePdfName}</span>
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
      {viewMode === 'detail' && (
        <>
          <div className="detail-metadata-cell">
            <span className="detail-source-name">{page.sourcePdfName}</span>
            <span>Title: {sourcePdf.metadata.title || 'Not Available'}</span>
            <span>Author: {sourcePdf.metadata.author || 'Not Available'}</span>
            <span>Subject: {sourcePdf.metadata.subject || 'Not Available'}</span>
            <span>Keywords: {sourcePdf.metadata.keywords || 'Not Available'}</span>
            <span>Created: {sourcePdf.metadata.creationDate || 'Not Available'}</span>
            <span>Modified: {sourcePdf.metadata.modificationDate || 'Not Available'}</span>
            <span>PDF version: {sourcePdf.metadata.version || 'Not Available'}</span>
          </div>
          <div className="detail-page-data">
            <span>Rotation: {page.rotation}°</span>
            <span>{page.width.toFixed(1)} × {page.height.toFixed(1)} pt</span>
            <span>Width: {page.width.toFixed(1)} pt</span>
            <span>Height: {page.height.toFixed(1)} pt</span>
          </div>
          <div className="detail-export-name" title={individualFilename(page)}>
            {individualFilename(page)}
          </div>
          <div className="detail-row-actions">
            <button
              type="button"
              aria-label={`Rotate page ${page.pageNumber}`}
              title="Rotate 90°"
              onPointerDown={stopCardAction}
              onClick={(event) => { stopCardAction(event); onRotatePage(page.id) }}
            >
              <RotateCw size={15} />
            </button>
            <button
              type="button"
              aria-label={`Delete page ${page.pageNumber}`}
              title="Delete page"
              onPointerDown={stopCardAction}
              onClick={(event) => { stopCardAction(event); onDeletePage(page.id) }}
            >
              <Trash2 size={15} />
            </button>
            <button
              className={`detail-select-button${isSelected ? ' is-selected' : ''}`}
              type="button"
              aria-label={isSelected ? `Deselect page ${page.pageNumber}` : `Select page ${page.pageNumber}`}
              aria-pressed={isSelected}
              onPointerDown={stopCardAction}
              onClick={(event) => {
                stopCardAction(event)
                onInspectPage(page.id)
                onSelectPage(page.id, { extend: false, toggle: true })
              }}
            >
              {isSelected ? 'Selected' : 'Select'}
            </button>
          </div>
        </>
      )}
    </article>
  )
}

export function PageGrid({
  pages,
  pdfs,
  isProcessing,
  selectedPageIds,
  viewMode,
  thumbnailSize,
  searchQuery,
  onToggleSelection,
  onSetSelection,
  onReorder,
  onRename,
  onInspectPage,
  onViewPage,
  onRotatePage,
  onDeletePage,
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
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null)
  const [hoverSlot, setHoverSlot] = useState<string | null>(null)
  const hoverSlotRef = useRef<string | null>(null)
  const dwellTimerRef = useRef<number | undefined>(undefined)
  const rearrangedAtRef = useRef<{ x: number; y: number } | null>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const cardPositionsRef = useRef(new Map<string, { x: number; y: number }>())
  const pageById = useMemo(() => new Map(pages.map((page) => [page.id, page])), [pages])
  const displayPages = useMemo(
    () =>
      previewOrder
        ? previewOrder.flatMap((id) => {
            const page = pageById.get(id)
            return page ? [page] : []
          })
        : pages,
    [pageById, pages, previewOrder],
  )
  const getDragPages = (pageId: string) =>
    selectedSet.has(pageId) && selectedSet.size > 1
      ? pages.filter((page) => selectedSet.has(page.id))
      : pages.filter((page) => page.id === pageId)
  const selectionAnchorId = useRef<string | null>(null)
  const [columnWidths, setColumnWidths] = useState([150, 190, 380, 180, 220, 150])
  const resizeRef = useRef<{ index: number; startX: number; width: number } | null>(null)
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

  const beginColumnResize = (index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    resizeRef.current = { index, startX: event.clientX, width: columnWidths[index] }
    const onMove = (moveEvent: PointerEvent) => {
      if (!resizeRef.current) return
      const { index: resizedIndex, startX, width } = resizeRef.current
      setColumnWidths((current) =>
        current.map((currentWidth, currentIndex) =>
          currentIndex === resizedIndex
            ? Math.min(640, Math.max(80, width + moveEvent.clientX - startX))
            : currentWidth,
        ),
      )
    }
    const onUp = () => {
      resizeRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const updateHoverSlot = (slot: string | null) => {
    hoverSlotRef.current = slot
    setHoverSlot(slot)
  }

  const startDrag = (pageId: string) => {
    setDraggingId(pageId)
    setPreviewOrder(null)
  }

  const endDrag = () => {
    window.clearTimeout(dwellTimerRef.current)
    rearrangedAtRef.current = null
    updateHoverSlot(null)
    setDraggingId(null)
    setPreviewOrder(null)
  }

  // Hovering a gap shows where the page would land; the cards only rearrange after the pointer rests there.
  const handleDragOverPage = (pageId: string, event: ReactDragEvent<HTMLElement>) => {
    if (!draggingId) return
    if (pageId === draggingId) {
      window.clearTimeout(dwellTimerRef.current)
      updateHoverSlot(null)
      return
    }
    const moved = rearrangedAtRef.current
    if (moved) {
      // Right after a rearrangement a different card sits under the pointer; wait for real movement.
      if (Math.hypot(event.clientX - moved.x, event.clientY - moved.y) < POINTER_MOVE_TOLERANCE_PX) return
      rearrangedAtRef.current = null
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    const isAfter =
      viewMode === 'detail'
        ? event.clientY > bounds.top + bounds.height / 2
        : event.clientX > bounds.left + bounds.width / 2
    const slot = `${pageId}|${isAfter ? 'after' : 'before'}`
    if (slot === hoverSlotRef.current) return

    window.clearTimeout(dwellTimerRef.current)
    updateHoverSlot(slot)
    const { clientX, clientY } = event
    dwellTimerRef.current = window.setTimeout(() => {
      const [overId, side] = slot.split('|') as [string, DropSide]
      rearrangedAtRef.current = { x: clientX, y: clientY }
      updateHoverSlot(null)
      setPreviewOrder((order) => placeItem(order ?? pages.map((page) => page.id), draggingId, overId, side))
    }, REARRANGE_DWELL_MS)
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
    let order = previewOrder ?? pages.map((page) => page.id)
    if (hoverSlot) {
      const [overId, side] = hoverSlot.split('|') as [string, DropSide]
      order = placeItem(order, draggingId, overId, side)
    }
    // Express the final slot as "after its previous neighbour" (or "before its next" when first).
    const index = order.indexOf(draggingId)
    const unchanged = order.every((id, position) => id === pages[position]?.id)
    if (!unchanged && index >= 0) {
      if (index > 0) onReorder(draggingId, order[index - 1], 'after')
      else if (order[1]) onReorder(draggingId, order[1], 'before')
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
    let draggedBounds: DOMRect | undefined
    const boundsById = new Map<string, DOMRect>()
    const canAnimate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches

    grid.querySelectorAll<HTMLElement>('[data-page-id]').forEach((card) => {
      const id = card.dataset.pageId
      if (!id) return
      const bounds = card.getBoundingClientRect()
      boundsById.set(id, bounds)
      if (id === draggingId) draggedBounds = bounds
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

    // The bar sits centred in the gap on one side of a card. Once the cards have rearranged it
    // opens up into an outline of the dragged page's new slot.
    const indicator = indicatorRef.current
    if (!indicator) return
    const hovered = hoverSlot?.split('|') as [string, DropSide] | undefined
    const slotBounds = !hovered && previewOrder ? draggedBounds : undefined
    const barBounds = hovered ? boundsById.get(hovered[0]) : undefined
    const bounds = slotBounds ?? barBounds
    indicator.classList.toggle('is-expanded', slotBounds !== undefined)
    if (!bounds) {
      indicator.style.opacity = '0'
      return
    }
    const isList = viewMode === 'detail'
    const left = bounds.left - gridBounds.left
    const top = bounds.top - gridBounds.top
    if (slotBounds) {
      indicator.style.width = `${bounds.width}px`
      indicator.style.height = `${bounds.height}px`
      indicator.style.transform = `translate(${left}px, ${top}px)`
    } else {
      const gap = parseFloat(isList ? getComputedStyle(grid).rowGap : getComputedStyle(grid).columnGap) || 0
      const thickness = 4
      const side = hovered?.[1]
      const along = isList
        ? (side === 'after' ? bounds.bottom - gridBounds.top + gap / 2 : top - gap / 2) - thickness / 2
        : (side === 'after' ? bounds.right - gridBounds.left + gap / 2 : left - gap / 2) - thickness / 2
      indicator.style.width = `${isList ? bounds.width : thickness}px`
      indicator.style.height = `${isList ? thickness : bounds.height}px`
      indicator.style.transform = `translate(${isList ? left : along}px, ${isList ? along : top}px)`
    }
    indicator.style.opacity = '1'
  }, [displayPages, draggingId, hoverSlot, previewOrder, viewMode])

  useEffect(() => {
    const forgetPositions = () => cardPositionsRef.current.clear()
    window.addEventListener('resize', forgetPositions)
    return () => {
      window.removeEventListener('resize', forgetPositions)
      window.clearTimeout(dwellTimerRef.current)
    }
  }, [])

  if (pages.length > 0) {
    return (
          <div
            ref={gridRef}
            className={`page-grid view-${viewMode}${marquee ? ' is-marquee-selecting' : ''}`}
            style={{
              '--page-card-min-width': `${174 * thumbnailSize / 100}px`,
              '--page-preview-height': `${224 * thumbnailSize / 100}px`,
              '--page-preview-padding': `${14 * thumbnailSize / 100}px`,
              '--detail-preview-height': `${140 * thumbnailSize / 100}px`,
              '--detail-columns': columnWidths
                .map((width, index) => index === 2 ? `minmax(${width}px, 1fr)` : `${width}px`)
                .join(' '),
            } as CSSProperties}
            aria-label={`${viewMode} view of PDF pages`}
            onPointerDown={handleGridPointerDown}
            onPointerMove={handleGridPointerMove}
            onPointerUp={handleGridPointerUp}
            onPointerCancel={handleGridPointerCancel}
            onDragOver={handleGridDragOver}
            onDrop={handleGridDrop}
          >
            {viewMode === 'detail' && (
              <div className="detail-table-header" aria-hidden="true">
                {['Preview', 'Page information', 'PDF metadata', 'Page data', 'Export name', 'Actions'].map((title, index) => (
                  <div className="detail-column-heading" key={title}>
                    <span>{title}</span>
                    {index < 5 && (
                      <button
                        type="button"
                        className="detail-column-resizer"
                        aria-label={`Resize ${title} column`}
                        onPointerDown={(event) => beginColumnResize(index, event)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
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
            {displayPages.map((page, index) => {
              const sourcePdf = sourcePdfById.get(page.sourcePdfId)
              if (!sourcePdf) return null
              return (
                <PageCard
                  key={page.id}
                  page={page}
                  index={index}
                  pages={displayPages}
                  sourcePdf={sourcePdf}
                  pdfs={pdfs}
                  getDragPages={getDragPages}
                  isBeingDragged={draggingId === page.id}
                  onDragStart={startDrag}
                  onDragEnd={endDrag}
                  onDragOverPage={handleDragOverPage}
                  isSelected={selectedSet.has(page.id)}
                  viewMode={viewMode}
                  onSelectPage={selectPage}
                  onReorder={onReorder}
                  onRename={onRename}
                  onInspectPage={onInspectPage}
                  onViewPage={onViewPage}
                  onRotatePage={onRotatePage}
                  onDeletePage={onDeletePage}
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
