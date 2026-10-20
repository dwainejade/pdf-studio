import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { FileWarning, Maximize2 } from 'lucide-react'
import { isRenderCancelled, loadPageBitmap } from '../../lib/pdfThumbnailCache'

const BOX_STEP_PX = 80

interface PageThumbnailProps {
  sourcePdfId: string
  sourcePdfName: string
  file: File
  pageNumber: number
  rotation: number
  onExpand?: () => void
  children?: ReactNode
}

export function PageThumbnail({
  sourcePdfId,
  sourcePdfName,
  file,
  pageNumber,
  rotation,
  onExpand,
  children,
}: PageThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [box, setBox] = useState<{ width: number; height: number }>()
  const [renderResult, setRenderResult] = useState<{ key: string; hasError: boolean }>()
  const renderKey = `${sourcePdfId}:${pageNumber}:${rotation}`
  const shouldLoad = isVisible || typeof IntersectionObserver === 'undefined'

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let observer: IntersectionObserver | undefined
    const revealWhenNearViewport = () => {
      const bounds = container.getBoundingClientRect()
      if (bounds.bottom < -500 || bounds.top > window.innerHeight + 500) return
      setIsVisible(true)
      observer?.disconnect()
      window.removeEventListener('scroll', revealWhenNearViewport)
      window.removeEventListener('resize', revealWhenNearViewport)
    }

    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) revealWhenNearViewport()
        },
        { rootMargin: '500px 0px' },
      )
      observer.observe(container)
    }
    const frame = window.requestAnimationFrame(revealWhenNearViewport)
    window.addEventListener('scroll', revealWhenNearViewport, { passive: true })
    window.addEventListener('resize', revealWhenNearViewport)

    return () => {
      observer?.disconnect()
      window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', revealWhenNearViewport)
      window.removeEventListener('resize', revealWhenNearViewport)
    }
  }, [])

  // Render at the card's own size (in steps, so resizing does not re-render on every pixel).
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => {
      const width = Math.ceil(container.clientWidth / BOX_STEP_PX) * BOX_STEP_PX
      const height = Math.ceil(container.clientHeight / BOX_STEP_PX) * BOX_STEP_PX
      if (width === 0 || height === 0) return
      setBox((current) =>
        current?.width === width && current.height === height ? current : { width, height },
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    let timer: number | undefined
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(measure, 120)
    })
    observer.observe(container)
    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!shouldLoad || !box) return
    let isCurrent = true
    const priority = () => {
      const container = containerRef.current
      if (!container?.isConnected) return Number.POSITIVE_INFINITY
      const bounds = container.getBoundingClientRect()
      return Math.abs((bounds.top + bounds.bottom) / 2 - window.innerHeight / 2)
    }
    const request = loadPageBitmap(sourcePdfId, file, pageNumber, rotation, box, priority)
    request.promise.then(
      (bitmap) => {
        const canvas = canvasRef.current
        if (!isCurrent || !canvas) return
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
        setRenderResult({ key: renderKey, hasError: false })
      },
      (error: unknown) => {
        if (isCurrent && !isRenderCancelled(error)) setRenderResult({ key: renderKey, hasError: true })
      },
    )
    return () => {
      isCurrent = false
      request.release()
    }
  }, [box, file, pageNumber, renderKey, rotation, shouldLoad, sourcePdfId])

  const hasImage = renderResult?.key === renderKey && !renderResult.hasError
  const hasError = renderResult?.key === renderKey && renderResult.hasError

  return (
    <div
      ref={containerRef}
      className={`page-preview${hasError ? ' has-preview-error' : ''}`}
      aria-label={`Preview for page ${pageNumber} of ${sourcePdfName}`}
    >
      <canvas
        ref={canvasRef}
        className="page-thumbnail"
        role="img"
        aria-label={`Page ${pageNumber} of ${sourcePdfName}`}
        style={hasImage ? undefined : { display: 'none' }}
      />
      {hasImage ? null : hasError ? (
        <span className="thumbnail-error" role="img" aria-label="Preview could not be rendered">
          <FileWarning size={22} />
          Preview unavailable
        </span>
      ) : (
        <span className="thumbnail-loading" aria-hidden="true" />
      )}
      {onExpand && (
        <button
          type="button"
          className="page-expand-button"
          aria-label={`View page ${pageNumber} full screen`}
          title="Full screen"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onExpand()
          }}
        >
          <Maximize2 size={14} />
        </button>
      )}
      {children}
    </div>
  )
}
