import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, FileText, Pencil, X } from 'lucide-react'
import type { PdfPage } from '../../types/pdf'

interface PageGridProps {
  pages: PdfPage[]
  isProcessing: boolean
  selectedPageIds: string[]
  onToggleSelection: (pageId: string) => void
  onSetSelection: (pageIds: string[]) => void
  onReorder: (activeId: string, overId: string) => void
  onRename: (pageId: string, label: string) => void
}

interface PageCardProps {
  page: PdfPage
  index: number
  pages: PdfPage[]
  isSelected: boolean
  onSelectPage: (pageId: string, modifiers: { extend: boolean; toggle: boolean }) => void
  onReorder: (activeId: string, overId: string) => void
  onRename: (pageId: string, label: string) => void
}

function PageCard({
  page,
  index,
  pages,
  isSelected,
  onSelectPage,
  onReorder,
  onRename,
}: PageCardProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftLabel, setDraftLabel] = useState(page.label ?? '')
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } =
    useSortable({ id: page.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    listeners?.onKeyDown?.(event)
    if (isDragging) return

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
    onSelectPage(page.id, { extend: false, toggle: true })
  }

  const handleCardClick = (event: ReactMouseEvent<HTMLElement>) => {
    onSelectPage(page.id, {
      extend: event.shiftKey,
      toggle: event.ctrlKey || event.metaKey,
    })
  }

  const beginRename = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setDraftLabel(page.label ?? '')
    setIsRenaming(true)
  }

  const finishRename = () => {
    onRename(page.id, draftLabel)
    setIsRenaming(false)
  }

  const cancelRename = () => {
    setDraftLabel(page.label ?? '')
    setIsRenaming(false)
  }

  return (
    <article
      ref={setNodeRef}
      className={`page-card${isDragging ? ' is-dragging' : ''}${isSelected ? ' is-selected' : ''}`}
      style={style}
      {...attributes}
      {...listeners}
      onKeyDown={handleKeyDown}
      onClick={handleCardClick}
      data-page-id={page.id}
      aria-label={`Reorder page ${page.pageNumber} from ${page.sourcePdfName}`}
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
      <div className="page-preview">
        <img
          className="page-thumbnail"
          src={page.thumbnail}
          alt={`Page ${page.pageNumber} of ${page.sourcePdfName}`}
          loading="lazy"
          style={{ transform: `rotate(${page.rotation}deg)` }}
        />
      </div>
      <div className="page-metadata">
        <span className="page-number">{page.pageNumber}</span>
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
  isProcessing,
  selectedPageIds,
  onToggleSelection,
  onSetSelection,
  onReorder,
  onRename,
}: PageGridProps) {
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const pageIds = useMemo(() => pages.map((page) => page.id), [pages])
  const selectedSet = useMemo(
    () => new Set(selectedPageIds),
    [selectedPageIds],
  )
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

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id))
    }
  }

  if (pages.length > 0) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={pageIds} strategy={rectSortingStrategy}>
          <div
            ref={gridRef}
            className={`page-grid${marquee ? ' is-marquee-selecting' : ''}`}
            onPointerDown={handleGridPointerDown}
            onPointerMove={handleGridPointerMove}
            onPointerUp={handleGridPointerUp}
            onPointerCancel={handleGridPointerCancel}
          >
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
            {pages.map((page, index) => (
              <PageCard
                key={page.id}
                page={page}
                index={index}
                pages={pages}
                isSelected={selectedSet.has(page.id)}
                onSelectPage={selectPage}
                onReorder={onReorder}
                onRename={onRename}
              />
            ))}
            {isProcessing && (
              <div className="loading-state" role="status">
                <span className="loading-spinner" />
                <span>Preparing more pages…</span>
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>
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
      <strong>A little space to get started</strong>
      <span>Add one or more PDFs above to see every page at a glance.</span>
    </div>
  )
}
