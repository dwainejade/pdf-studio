import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { PdfPage, UploadedPdf } from '../../types/pdf'
import { loadPageThumbnail, renderFullPage } from '../../lib/pdfThumbnailCache'

interface PagePreviewViewerProps {
  pages: PdfPage[]
  pdfs: UploadedPdf[]
  pageId: string
  onNavigate: (pageId: string) => void
  onClose: () => void
}

function stageBox() {
  return {
    width: Math.max(200, window.innerWidth - 160),
    height: Math.max(200, window.innerHeight - 110),
  }
}

export function PagePreviewViewer({ pages, pdfs, pageId, onNavigate, onClose }: PagePreviewViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState(stageBox)
  const [rendered, setRendered] = useState<{ key: string; failed: boolean }>()
  const [placeholder, setPlaceholder] = useState<{ key: string; src: string }>()
  const index = pages.findIndex((page) => page.id === pageId)
  const page = pages[index]
  const sourcePdf = page && pdfs.find((pdf) => pdf.id === page.sourcePdfId)
  const pageKey = page ? `${page.id}:${page.rotation}` : ''
  const renderKey = `${pageKey}:${box.width}x${box.height}`
  const isLoading = rendered?.key !== renderKey
  const previousId = pages[index - 1]?.id
  const nextId = pages[index + 1]?.id

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
    }
  }, [])

  useEffect(() => {
    // Capture phase so the grid's own arrow-key reordering never sees these keys.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowLeft') {
        if (previousId) onNavigate(previousId)
      } else if (event.key === 'ArrowRight') {
        if (nextId) onNavigate(nextId)
      } else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [nextId, onClose, onNavigate, previousId])

  // The cached grid thumbnail shows instantly while the full-resolution render runs.
  useEffect(() => {
    if (!page || !sourcePdf) return
    let isCurrent = true
    void loadPageThumbnail(page.sourcePdfId, sourcePdf.file, page.pageNumber, page.rotation).then(
      (src) => {
        if (isCurrent) setPlaceholder({ key: pageKey, src })
      },
      () => {},
    )
    return () => {
      isCurrent = false
    }
  }, [page, pageKey, sourcePdf])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!page || !sourcePdf || !canvas) return
    const render = renderFullPage(
      page.sourcePdfId,
      sourcePdf.file,
      page.pageNumber,
      page.rotation,
      box,
      canvas,
    )
    render.promise.then(
      () => setRendered({ key: renderKey, failed: false }),
      (error: unknown) => {
        if (error instanceof Error && error.name === 'RenderingCancelledException') return
        setRendered({ key: renderKey, failed: true })
      },
    )
    return () => render.cancel()
  }, [box, page, renderKey, sourcePdf])

  if (!page) return null
  const showFailure = rendered?.key === renderKey && rendered.failed
  const showPlaceholder = isLoading && placeholder?.key === pageKey

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
      <div className="page-viewer-stage" onClick={onClose}>
        {showPlaceholder && (
          <img className="page-viewer-image is-placeholder" src={placeholder.src} alt="" />
        )}
        <canvas
          ref={canvasRef}
          className="page-viewer-image"
          hidden={isLoading}
          onClick={(event) => event.stopPropagation()}
        />
        {showFailure && <span className="page-viewer-message">This page could not be rendered.</span>}
        {isLoading && !showFailure && <span className="loading-spinner page-viewer-spinner" />}
      </div>
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
  )
}
