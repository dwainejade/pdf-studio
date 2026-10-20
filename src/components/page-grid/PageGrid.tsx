import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
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
import { Check, FileText, Pencil, RotateCw, Trash2, X } from 'lucide-react'
import type { PdfPage, UploadedPdf } from '../../types/pdf'
import type { PageViewMode } from '../../store/viewPreferences'
import { individualFilename } from '../../lib/export/filenames'
import { PageThumbnail } from './PageThumbnail'
import { DragOutHandle } from './DragOutHandle'

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
  onReorder: (activeId: string, overId: string) => void
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
  getDragPages: (pageId: string) => PdfPage[]
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
  getDragPages,
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
        <DragOutHandle page={page} pdfs={pdfs} getDragPages={() => getDragPages(page.id)} />
      </PageThumbnail>
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
  const sourcePdfById = useMemo(
    () => new Map(pdfs.map((pdf) => [pdf.id, pdf])),
    [pdfs],
  )
  const selectedSet = useMemo(
    () => new Set(selectedPageIds),
    [selectedPageIds],
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
