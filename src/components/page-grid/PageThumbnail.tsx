import { useEffect, useRef, useState } from 'react'
import { FileWarning } from 'lucide-react'
import { loadPageThumbnail } from '../../lib/pdfThumbnailCache'

interface PageThumbnailProps {
  sourcePdfId: string
  sourcePdfName: string
  file: File
  pageNumber: number
  rotation: number
}

export function PageThumbnail({
  sourcePdfId,
  sourcePdfName,
  file,
  pageNumber,
  rotation,
}: PageThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [renderResult, setRenderResult] = useState<{
    key: string
    thumbnail?: string
    hasError: boolean
  }>()
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

  useEffect(() => {
    if (!shouldLoad) return
    let isCurrent = true
    void loadPageThumbnail(sourcePdfId, file, pageNumber, rotation).then(
      (result) => {
        if (isCurrent) setRenderResult({ key: renderKey, thumbnail: result, hasError: false })
      },
      () => {
        if (isCurrent) setRenderResult({ key: renderKey, hasError: true })
      },
    )
    return () => {
      isCurrent = false
    }
  }, [file, pageNumber, renderKey, rotation, shouldLoad, sourcePdfId])

  const thumbnail =
    renderResult?.key === renderKey ? renderResult.thumbnail : undefined
  const hasError =
    renderResult?.key === renderKey && renderResult.hasError

  return (
    <div
      ref={containerRef}
      className={`page-preview${hasError ? ' has-preview-error' : ''}`}
      aria-label={`Preview for page ${pageNumber} of ${sourcePdfName}`}
    >
      {thumbnail ? (
        <img
          className="page-thumbnail"
          src={thumbnail}
          alt={`Page ${pageNumber} of ${sourcePdfName}`}
          decoding="async"
        />
      ) : hasError ? (
        <span className="thumbnail-error" role="img" aria-label="Preview could not be rendered">
          <FileWarning size={22} />
          Preview unavailable
        </span>
      ) : (
        <span className="thumbnail-loading" aria-hidden="true" />
      )}
    </div>
  )
}
