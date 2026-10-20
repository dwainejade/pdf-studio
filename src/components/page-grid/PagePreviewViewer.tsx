import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronLeft, ChevronRight, RotateCw, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import type { PdfPage, UploadedPdf } from '../../types/pdf'
import { peekPageBitmap, renderFullPage } from '../../lib/pdfThumbnailCache'

interface PagePreviewViewerProps {
  pages: PdfPage[]
  pdfs: UploadedPdf[]
  pageId: string
  onNavigate: (pageId: string) => void
  onRotate: (pageId: string) => void
  onDelete: (pageId: string) => void
  onClose: () => void
}

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]
const ZOOM_ANIMATION_MS = 220
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
  onDelete,
  onClose,
}: PagePreviewViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null)
  const zoomTimerRef = useRef<number | undefined>(undefined)
  const [box, setBox] = useState(stageBox)
  // Zoom belongs to one page: moving to another page starts again at 100%.
  const [zoomState, setZoomState] = useState({ pageId, zoom: 1, sharp: 1 })
  const zoom = zoomState.pageId === pageId ? zoomState.zoom : 1
  const sharpZoom = zoomState.pageId === pageId ? zoomState.sharp : 1
  const [isZoomAnimating, setIsZoomAnimating] = useState(false)
  const [aspect, setAspect] = useState(0.77)
  const [rendered, setRendered] = useState<{ key: string; failed: boolean }>()
  const index = pages.findIndex((page) => page.id === pageId)
  const page = pages[index]
  const sourcePdf = page && pdfs.find((pdf) => pdf.id === page.sourcePdfId)
  const pageKey = page ? `${page.id}:${page.rotation}` : ''
  const isLoading = rendered?.key !== pageKey
  const previousId = pages[index - 1]?.id
  const nextId = pages[index + 1]?.id

  // Page size at 100%: the whole page fits the stage.
  const fitWidth = Math.min(box.width, box.height * aspect)
  const fitHeight = fitWidth / aspect

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
    const neighbour = nextId ?? previousId
    if (neighbour) onNavigate(neighbour)
    else onClose()
    onDelete(page.id)
  }

  useEffect(() => {
    // Capture phase so the grid's own arrow-key reordering never sees these keys.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowLeft') {
        if (previousId) onNavigate(previousId)
      } else if (event.key === 'ArrowRight') {
        if (nextId) onNavigate(nextId)
      } else if (event.key === '+' || event.key === '=') stepZoom(1)
      else if (event.key === '-') stepZoom(-1)
      else if (event.key === '0') changeZoom(1)
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [changeZoom, nextId, onClose, onNavigate, previousId, stepZoom])

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
    const canvas = canvasRef.current
    if (!page || !sourcePdf || !canvas) return
    // An already-rendered grid thumbnail shows instantly while the sharp render runs.
    const placeholder = peekPageBitmap(page.sourcePdfId, page.pageNumber, page.rotation)
    if (placeholder && canvas.dataset.pageKey !== pageKey) {
      canvas.width = placeholder.width
      canvas.height = placeholder.height
      canvas.getContext('2d')?.drawImage(placeholder, 0, 0)
      setAspect(placeholder.width / placeholder.height)
    }
    // Hide the previous page's pixels when there is nothing to show in their place.
    if (canvas.dataset.pageKey !== pageKey) canvas.style.visibility = placeholder ? 'visible' : 'hidden'

    const render = renderFullPage(
      page.sourcePdfId,
      sourcePdf.file,
      page.pageNumber,
      page.rotation,
      { width: box.width * sharpZoom, height: box.height * sharpZoom },
      canvas,
    )
    render.promise.then(
      () => {
        canvas.dataset.pageKey = pageKey
        canvas.style.visibility = 'visible'
        setAspect(canvas.width / canvas.height)
        setRendered({ key: pageKey, failed: false })
      },
      (error: unknown) => {
        if (error instanceof Error && error.name === 'RenderingCancelledException') return
        setRendered({ key: pageKey, failed: true })
      },
    )
    return () => render.cancel()
  }, [box, page, pageKey, sourcePdf, sharpZoom])

  const handlePanStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current
    if (!stage || event.button !== 0) return
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
  const showFailure = rendered?.key === pageKey && rendered.failed
  const percent = Math.round(zoom * 100)

  return (
    <div
      ref={dialogRef}
      className="page-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`Page ${page.pageNumber} of ${page.sourcePdfName}, full view`}
      tabIndex={-1}
    >
      <header className="page-viewer-bar">
        <div className="page-viewer-title">
          <strong>{page.label || page.sourcePdfName}</strong>
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
          <canvas
            ref={canvasRef}
            className={`page-viewer-image${isZoomAnimating ? ' is-zooming' : ''}`}
            style={{ width: fitWidth * zoom, height: fitHeight * zoom }}
            onClick={(event) => event.stopPropagation()}
          />
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
        <button type="button" className="page-action-button" onClick={() => onRotate(page.id)}>
          <RotateCw size={16} />
          <span>Rotate 90°</span>
        </button>
        <button type="button" className="page-action-button destructive" onClick={handleDelete}>
          <Trash2 size={16} />
          <span>Delete</span>
        </button>
      </div>
    </div>
  )
}
