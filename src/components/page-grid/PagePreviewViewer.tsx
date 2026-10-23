import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { flushSync } from 'react-dom'
import { Check, ChevronLeft, ChevronRight, Pencil, RotateCcw, RotateCw, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { TextLayer } from 'pdfjs-dist'
import type { PdfPage, UploadedPdf } from '../../types/pdf'
import {
  loadFullPageTextLayer,
  peekPageBitmap,
  renderFullPage,
  thumbnailBaseRotation,
  type FullPageTextLayer,
} from '../../lib/pdfThumbnailCache'

interface PageTextLayer extends FullPageTextLayer {
  key: string
}

interface PagePreviewViewerProps {
  pages: PdfPage[]
  pdfs: UploadedPdf[]
  pageId: string
  onNavigate: (pageId: string) => void
  onRotate: (pageId: string, delta: number) => void
  onRename: (pageId: string, label: string) => void
  onDelete: (pageId: string) => void
  onClose: () => void
}

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]
const ZOOM_ANIMATION_MS = 220
const ROTATE_ANIMATION_MS = 320
const SHARP_RENDER_DELAY_MS = 250
const STAGE_SIDE_PADDING = 80
const BARS_HEIGHT = 58 + 78

function stageBox() {
  return {
    width: Math.max(200, window.innerWidth - STAGE_SIDE_PADDING * 2),
    height: Math.max(200, window.innerHeight - BARS_HEIGHT),
  }
}

export function PagePreviewViewer({
  pages,
  pdfs,
  pageId,
  onNavigate,
  onRotate,
  onRename,
  onDelete,
  onClose,
}: PagePreviewViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pageSurfaceRef = useRef<HTMLDivElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null)
  const zoomTimerRef = useRef<number | undefined>(undefined)
  const [box, setBox] = useState(stageBox)
  // Zoom belongs to one page: moving to another page starts again at 100%.
  const [zoomState, setZoomState] = useState({ pageId, zoom: 1, sharp: 1 })
  const [editingPageId, setEditingPageId] = useState<string | null>(null)
  const [draftLabel, setDraftLabel] = useState('')
  const zoom = zoomState.pageId === pageId ? zoomState.zoom : 1
  const sharpZoom = zoomState.pageId === pageId ? zoomState.sharp : 1
  const [isZoomAnimating, setIsZoomAnimating] = useState(false)
  const [aspect, setAspect] = useState(0.77)
  const [rendered, setRendered] = useState<{ key: string; failed: boolean }>()
  const [pageTextLayer, setPageTextLayer] = useState<PageTextLayer>()
  const [textLayerError, setTextLayerError] = useState<{ key: string; message: string }>()
  // A turn is animated on the pixels already on screen; the re-render at the new rotation swaps in afterwards.
  const motionRef = useRef({ pageId, prevRotation: 0, visual: 0, animEnd: 0 })
  const layoutRef = useRef({ box: { width: 0, height: 0 }, aspect: 0.77 })
  const index = pages.findIndex((page) => page.id === pageId)
  const page = pages[index]
  const isRenaming = editingPageId === pageId
  const sourcePdf = page && pdfs.find((pdf) => pdf.id === page.sourcePdfId)
  const rotation = page?.rotation
  const renderKey = `${pageId}:${rotation}`
  const isLoading = rendered?.key !== renderKey
  const previousId = pages[index - 1]?.id
  const nextId = pages[index + 1]?.id

  // Page size at 100%: the whole page fits the stage.
  const fitWidth = Math.min(box.width, box.height * aspect)
  const fitHeight = fitWidth / aspect
  const textLayerKey = `${renderKey}:${box.width}:${box.height}:${sharpZoom}`
  const surfaceWidth = fitWidth * zoom
  const surfaceHeight = fitHeight * zoom

  useEffect(() => {
    layoutRef.current = { box, aspect }
  }, [box, aspect])

  useEffect(() => {
    const surface = pageSurfaceRef.current
    const motion = motionRef.current
    if (rotation === undefined || !surface) return
    if (motion.pageId !== pageId) {
      motion.pageId = pageId
      motion.prevRotation = rotation
      motion.visual = 0
      return
    }
    const turned = ((((rotation - motion.prevRotation) % 360) + 540) % 360) - 180
    motion.prevRotation = rotation
    if (turned === 0) return

    motion.visual += turned
    const { box: stage, aspect: pixelAspect } = layoutRef.current
    const width = Math.min(stage.width, stage.height * pixelAspect)
    const isSideways = Math.round(motion.visual / 90) % 2 !== 0
    const scale = isSideways ? Math.min(stage.width, stage.height / pixelAspect) / (width / pixelAspect) : 1
    surface.style.transition = `transform ${ROTATE_ANIMATION_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`
    surface.style.transform = `rotate(${motion.visual}deg) scale(${scale})`
    motion.animEnd = performance.now() + ROTATE_ANIMATION_MS
  }, [pageId, rotation])

  useEffect(() => {
    if (!page) onClose()
  }, [onClose, page])

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  useEffect(() => {
    let timer: number | undefined
    const onResize = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setBox(stageBox()), 200)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', onResize)
      window.clearTimeout(zoomTimerRef.current)
    }
  }, [])

  // Zooms with a CSS size transition, keeping whatever is at the centre of the view in place.
  const changeZoom = useCallback((next: number) => {
    const clamped = Math.min(ZOOM_STEPS[ZOOM_STEPS.length - 1], Math.max(ZOOM_STEPS[0], next))
    const stage = stageRef.current
    const centre = stage
      ? {
          x: (stage.scrollLeft + stage.clientWidth / 2) / Math.max(stage.scrollWidth, 1),
          y: (stage.scrollTop + stage.clientHeight / 2) / Math.max(stage.scrollHeight, 1),
        }
      : undefined
    setIsZoomAnimating(true)
    setZoomState((current) => ({
      pageId,
      zoom: clamped,
      sharp: current.pageId === pageId ? current.sharp : 1,
    }))
    window.clearTimeout(zoomTimerRef.current)
    zoomTimerRef.current = window.setTimeout(() => {
      setIsZoomAnimating(false)
      setZoomState({ pageId, zoom: clamped, sharp: Math.max(clamped, 1) })
    }, Math.max(ZOOM_ANIMATION_MS, SHARP_RENDER_DELAY_MS))

    if (!stage || !centre) return
    const started = performance.now()
    const follow = () => {
      stage.scrollLeft = centre.x * stage.scrollWidth - stage.clientWidth / 2
      stage.scrollTop = centre.y * stage.scrollHeight - stage.clientHeight / 2
      if (performance.now() - started < ZOOM_ANIMATION_MS + 40) window.requestAnimationFrame(follow)
    }
    window.requestAnimationFrame(follow)
  }, [pageId])

  const stepZoom = useCallback(
    (direction: 1 | -1) => {
      const next =
        direction > 0
          ? ZOOM_STEPS.find((step) => step > zoom + 0.001)
          : [...ZOOM_STEPS].reverse().find((step) => step < zoom - 0.001)
      if (next !== undefined) changeZoom(next)
    },
    [changeZoom, zoom],
  )

  const handleDelete = () => {
    if (!page) return
    onDelete(page.id)
  }

  const beginRename = () => {
    if (!page) return
    setDraftLabel(page.label || page.sourcePdfName)
    setEditingPageId(page.id)
  }

  const finishRename = () => {
    if (!page) return
    const label = draftLabel.trim()
    onRename(page.id, !page.label && label === page.sourcePdfName ? '' : label)
    setEditingPageId(null)
  }

  const cancelRename = () => {
    setDraftLabel(page?.label ?? '')
    setEditingPageId(null)
  }

  useEffect(() => {
    // Capture phase so the grid's own arrow-key reordering never sees these keys.
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        (event.target instanceof HTMLElement && event.target.closest('[role="alertdialog"]'))
      ) {
        return
      }
      const selection = window.getSelection()
      if (
        event.key.startsWith('Arrow') &&
        selection &&
        !selection.isCollapsed &&
        dialogRef.current?.contains(selection.anchorNode)
      ) {
        return
      }
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowLeft') {
        if (previousId) onNavigate(previousId)
      } else if (event.key === 'ArrowRight') {
        if (nextId) onNavigate(nextId)
      } else if (event.key === '+' || event.key === '=') stepZoom(1)
      else if (event.key === '-') stepZoom(-1)
      else if (event.key === '0') changeZoom(1)
      else if (event.key.toLowerCase() === 'r' && page) onRotate(page.id, event.shiftKey ? -90 : 90)
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [changeZoom, nextId, onClose, onNavigate, onRotate, page, previousId, stepZoom])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      stepZoom(event.deltaY < 0 ? 1 : -1)
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [stepZoom])

  useEffect(() => {
    if (!page || !sourcePdf) return
    let isCurrent = true

    void loadFullPageTextLayer(
      page.sourcePdfId,
      sourcePdf.file,
      page.pageNumber,
      page.rotation,
      { width: box.width * sharpZoom, height: box.height * sharpZoom },
    ).then(
      ({ textContent, viewport }) => {
        if (!isCurrent) return
        const hasText = textContent.items.some(
          (item) => 'str' in item && item.str.trim().length > 0,
        )
        if (hasText) setPageTextLayer({ key: textLayerKey, textContent, viewport })
      },
      (error: unknown) => {
        if (!isCurrent) return
        setTextLayerError({
          key: textLayerKey,
          message: error instanceof Error ? error.message : 'The page text could not be loaded.',
        })
      },
    )

    return () => {
      isCurrent = false
    }
  }, [box.height, box.width, page, sharpZoom, sourcePdf, textLayerKey])

  useEffect(() => {
    const container = textLayerRef.current
    if (!container || !pageTextLayer || pageTextLayer.key !== textLayerKey) return
    let isCurrent = true
    container.replaceChildren()
    const textLayer = new TextLayer({
      textContentSource: pageTextLayer.textContent,
      container,
      viewport: pageTextLayer.viewport,
    })
    container.style.setProperty('--text-scale-factor', '1')
    void textLayer.render().catch((error: unknown) => {
      if (!isCurrent) return
      setTextLayerError({
        key: textLayerKey,
        message: error instanceof Error ? error.message : 'The page text could not be displayed.',
      })
    })
    return () => {
      isCurrent = false
      textLayer.cancel()
      container.replaceChildren()
    }
  }, [pageTextLayer, textLayerKey])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!page || !sourcePdf || !canvas) return
    if (canvas.dataset.pageId !== pageId) {
      // First draw for this page: reset any turn left over from the previous one.
      const surface = pageSurfaceRef.current
      if (surface) {
        surface.style.transition = 'none'
        surface.style.transform = 'none'
      }
      motionRef.current.visual = 0
      // An already-rendered grid thumbnail shows instantly while the sharp render runs.
      const base = thumbnailBaseRotation(page.sourcePdfId, page.pageNumber, page.rotation)
      const placeholder =
        base === page.rotation ? peekPageBitmap(page.sourcePdfId, page.pageNumber, base) : undefined
      if (placeholder) {
        canvas.width = placeholder.width
        canvas.height = placeholder.height
        canvas.getContext('2d')?.drawImage(placeholder, 0, 0)
        setAspect(placeholder.width / placeholder.height)
      }
      // Hide the previous page pixels when there is nothing to show in their place.
      canvas.style.visibility = placeholder ? 'visible' : 'hidden'
      canvas.dataset.pageId = pageId
    }

    // Render off-screen so the new pixels only appear once any turn animation has finished.
    const buffer = document.createElement('canvas')
    let isCurrent = true
    const render = renderFullPage(
      page.sourcePdfId,
      sourcePdf.file,
      page.pageNumber,
      page.rotation,
      { width: box.width * sharpZoom, height: box.height * sharpZoom },
      buffer,
    )
    render.promise
      .then(async () => {
        const remaining = motionRef.current.animEnd - performance.now()
        if (remaining > 0) await new Promise((resolve) => window.setTimeout(resolve, remaining))
        if (!isCurrent) return
        canvas.width = buffer.width
        canvas.height = buffer.height
        canvas.getContext('2d')?.drawImage(buffer, 0, 0)
        const surface = pageSurfaceRef.current
        if (surface) {
          surface.style.transition = 'none'
          surface.style.transform = 'none'
        }
        motionRef.current.visual = 0
        // The size has to follow the new orientation in the same frame as the pixels.
        flushSync(() => {
          setAspect(buffer.width / buffer.height)
          setRendered({ key: renderKey, failed: false })
        })
        canvas.style.visibility = 'visible'
        void canvas.offsetWidth
        canvas.style.transition = ''
        buffer.width = 0
        buffer.height = 0
      })
      .catch((error: unknown) => {
        if (!isCurrent || (error instanceof Error && error.name === 'RenderingCancelledException')) return
        setRendered({ key: renderKey, failed: true })
      })
    return () => {
      isCurrent = false
      render.cancel()
    }
  }, [box, page, pageId, renderKey, sourcePdf, sharpZoom])

  const handlePanStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current
    if (!stage || event.button !== 0) return
    if (event.target instanceof HTMLElement && event.target.closest('.page-viewer-text-layer')) {
      return
    }
    panRef.current = {
      x: event.clientX,
      y: event.clientY,
      left: stage.scrollLeft,
      top: stage.scrollTop,
      moved: false,
    }
  }

  const handlePanMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current
    const stage = stageRef.current
    if (!pan || !stage) return
    const dx = event.clientX - pan.x
    const dy = event.clientY - pan.y
    if (!pan.moved && Math.hypot(dx, dy) < 4) return
    pan.moved = true
    stage.scrollLeft = pan.left - dx
    stage.scrollTop = pan.top - dy
  }

  const handlePanEnd = () => {
    // Keep the flag until the click that ends a drag has been ignored.
    window.setTimeout(() => {
      panRef.current = null
    }, 0)
  }

  if (!page) return null
  const showFailure = rendered?.key === renderKey && rendered.failed
  const activeTextLayerError =
    textLayerError?.key === textLayerKey ? textLayerError.message : undefined
  const showNativeTextLayer = !isLoading && pageTextLayer?.key === textLayerKey
  const percent = Math.round(zoom * 100)

  return (
    <div
      ref={dialogRef}
      className="page-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`Page ${page.pageNumber} of ${page.label || page.sourcePdfName}, full view`}
      tabIndex={-1}
    >
      <header className="page-viewer-bar">
        <div className="page-viewer-title">
          <div className="page-viewer-title-name">
            {isRenaming ? (
              <>
                <input
                  className="page-viewer-title-input"
                  value={draftLabel}
                  autoFocus
                  aria-label={`Page ${page.pageNumber} label`}
                  onFocus={(event) => event.target.select()}
                  onChange={(event) => setDraftLabel(event.target.value)}
                  onBlur={finishRename}
                  onKeyDown={(event) => {
                    event.stopPropagation()
                    if (event.key === 'Enter') finishRename()
                    if (event.key === 'Escape') cancelRename()
                  }}
                />
                <div className="page-viewer-title-actions">
                  <button
                    type="button"
                    aria-label="Save page label"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={finishRename}
                  >
                    <Check size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel page label edit"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={cancelRename}
                  >
                    <X size={13} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <strong>{page.label || page.sourcePdfName}</strong>
                <button
                  type="button"
                  className="page-viewer-rename-button"
                  aria-label={`Rename page ${page.pageNumber}`}
                  onClick={beginRename}
                >
                  <Pencil size={13} />
                </button>
              </>
            )}
          </div>
          <span>
            Page {page.pageNumber} · {index + 1} of {pages.length}
          </span>
        </div>
        <button type="button" className="page-viewer-close" aria-label="Close full view" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <div className="page-viewer-stage-wrap">
        <div
          ref={stageRef}
          className={`page-viewer-stage${zoom > 1 ? ' is-zoomed' : ''}`}
          onPointerDown={handlePanStart}
          onPointerMove={handlePanMove}
          onPointerUp={handlePanEnd}
          onPointerCancel={handlePanEnd}
          onClick={(event) => {
            if (event.target === event.currentTarget && !panRef.current?.moved) onClose()
          }}
        >
          <div
            ref={pageSurfaceRef}
            className={`page-viewer-page${isZoomAnimating ? ' is-zooming' : ''}`}
            style={{ width: surfaceWidth, height: surfaceHeight }}
          >
            <canvas
              ref={canvasRef}
              className="page-viewer-image"
              onClick={(event) => event.stopPropagation()}
            />
            {pageTextLayer?.key === textLayerKey && (
              <div
                ref={textLayerRef}
                className="page-viewer-text-layer"
                style={{
                  width: pageTextLayer.viewport.width,
                  height: pageTextLayer.viewport.height,
                  transform: `scale(${surfaceWidth / pageTextLayer.viewport.width}, ${surfaceHeight / pageTextLayer.viewport.height})`,
                  visibility: showNativeTextLayer ? 'visible' : 'hidden',
                }}
              />
            )}
          </div>
        </div>
        {showFailure && <span className="page-viewer-message">This page could not be rendered.</span>}
        {isLoading && !showFailure && <span className="loading-spinner page-viewer-spinner" />}
        <button
          type="button"
          className="page-viewer-nav is-previous"
          aria-label="Previous page"
          disabled={!previousId}
          onClick={() => previousId && onNavigate(previousId)}
        >
          <ChevronLeft size={26} />
        </button>
        <button
          type="button"
          className="page-viewer-nav is-next"
          aria-label="Next page"
          disabled={!nextId}
          onClick={() => nextId && onNavigate(nextId)}
        >
          <ChevronRight size={26} />
        </button>
      </div>
      <div className="page-viewer-toolbar" aria-label="Page actions">
        <div className="page-viewer-zoom" role="group" aria-label="Zoom">
          <button
            type="button"
            className="page-viewer-zoom-button"
            aria-label="Zoom out"
            title="Zoom out (-)"
            disabled={zoom <= ZOOM_STEPS[0]}
            onClick={() => stepZoom(-1)}
          >
            <ZoomOut size={16} />
          </button>
          <button
            type="button"
            className="page-viewer-zoom-level"
            aria-label={`Zoom ${percent}%. Reset to fit`}
            title="Reset to fit (0)"
            onClick={() => changeZoom(1)}
          >
            {percent}%
          </button>
          <button
            type="button"
            className="page-viewer-zoom-button"
            aria-label="Zoom in"
            title="Zoom in (+)"
            disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
            onClick={() => stepZoom(1)}
          >
            <ZoomIn size={16} />
          </button>
        </div>
        <span className="page-viewer-toolbar-divider" aria-hidden="true" />
        {activeTextLayerError && (
          <span className="page-viewer-message" role="status">
            {activeTextLayerError}
          </span>
        )}
        <span className="page-viewer-toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          className="page-action-button"
          aria-label="Rotate left 90 degrees"
          title="Rotate left (Shift+R)"
          onClick={() => onRotate(page.id, -90)}
        >
          <RotateCcw size={16} />
        </button>
        <button
          type="button"
          className="page-action-button"
          aria-label="Rotate right 90 degrees"
          title="Rotate right (R)"
          onClick={() => onRotate(page.id, 90)}
        >
          <RotateCw size={16} />
        </button>
        <button type="button" className="page-action-button destructive" onClick={handleDelete}>
          <Trash2 size={16} />
          <span>Delete</span>
        </button>
      </div>
    </div>
  )
}
