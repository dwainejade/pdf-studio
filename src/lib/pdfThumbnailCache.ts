import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFJS_ASSET_OPTIONS } from './pdfjsOptions'
import { fullPageScale, generateThumbnail } from './thumbnailGenerator'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const MAX_CACHED_THUMBNAILS = 72
const MAX_THUMBNAIL_CACHE_BYTES = 48 * 1024 * 1024
const MAX_CONCURRENT_RENDERS = 2
const documentCache = new Map<string, Promise<PDFDocumentProxy>>()
const thumbnailCache = new Map<string, { promise: Promise<string>; bytes: number }>()
const renderWaiters: Array<() => void> = []
let activeRenders = 0
let cachedThumbnailBytes = 0

async function withRenderSlot<T>(render: () => Promise<T>): Promise<T> {
  if (activeRenders >= MAX_CONCURRENT_RENDERS) {
    await new Promise<void>((resolve) => renderWaiters.push(resolve))
  }
  activeRenders += 1
  try {
    return await render()
  } finally {
    activeRenders -= 1
    renderWaiters.shift()?.()
  }
}

function touchCache<T>(cache: Map<string, T>, key: string, value: T): void {
  cache.delete(key)
  cache.set(key, value)
}

function getDocument(sourcePdfId: string, file: File): Promise<PDFDocumentProxy> {
  const existing = documentCache.get(sourcePdfId)
  if (existing) {
    touchCache(documentCache, sourcePdfId, existing)
    return existing
  }

  const documentPromise = file.arrayBuffer().then((buffer) =>
    pdfjs.getDocument({ data: new Uint8Array(buffer), ...PDFJS_ASSET_OPTIONS }).promise,
  )
  documentCache.set(sourcePdfId, documentPromise)
  void documentPromise.catch(() => {
    if (documentCache.get(sourcePdfId) === documentPromise) {
      documentCache.delete(sourcePdfId)
    }
  })
  return documentPromise
}

export function loadPageThumbnail(
  sourcePdfId: string,
  file: File,
  pageNumber: number,
  rotation: number,
): Promise<string> {
  const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 3)
  const key = `${sourcePdfId}:${pageNumber}:${rotation}:${devicePixelRatio}`
  const cached = thumbnailCache.get(key)
  if (cached) {
    touchCache(thumbnailCache, key, cached)
    return cached.promise
  }

  const entry = { promise: Promise.resolve(''), bytes: 0 }
  const thumbnail = getDocument(sourcePdfId, file)
    .then((document) => document.getPage(pageNumber))
    .then(async (page) => {
      try {
        return await withRenderSlot(() => generateThumbnail(page, rotation))
      } finally {
        page.cleanup()
      }
    })

  entry.promise = thumbnail
  thumbnailCache.set(key, entry)
  const trimCache = () => {
    while (
      thumbnailCache.size > MAX_CACHED_THUMBNAILS ||
      cachedThumbnailBytes > MAX_THUMBNAIL_CACHE_BYTES
    ) {
      const oldestKey = thumbnailCache.keys().next().value
      if (oldestKey === undefined) break
      const oldestEntry = thumbnailCache.get(oldestKey)
      thumbnailCache.delete(oldestKey)
      cachedThumbnailBytes -= oldestEntry?.bytes ?? 0
    }
  }

  void thumbnail.then(
    (result) => {
      if (thumbnailCache.get(key) === entry) {
        entry.bytes = result.length * 0.75
        cachedThumbnailBytes += entry.bytes
        trimCache()
      }
    },
    () => {
      if (thumbnailCache.get(key) === entry) {
        cachedThumbnailBytes -= entry.bytes
        thumbnailCache.delete(key)
      }
    },
  )
  return thumbnail
}

export interface FullPageRender {
  promise: Promise<void>
  cancel: () => void
}

/** Renders one page sharp enough to fill `target` CSS pixels, drawing into `output` only once finished. */
export function renderFullPage(
  sourcePdfId: string,
  file: File,
  pageNumber: number,
  rotation: number,
  target: { width: number; height: number },
  output: HTMLCanvasElement,
): FullPageRender {
  let cancelled = false
  let task: RenderTask | undefined

  const promise = (async () => {
    const pdfDocument = await getDocument(sourcePdfId, file)
    const page = await pdfDocument.getPage(pageNumber)
    try {
      if (cancelled) return
      const viewport = page.getViewport({
        scale: fullPageScale(page.getViewport({ scale: 1, rotation }), target),
        rotation,
      })
      const buffer = document.createElement('canvas')
      buffer.width = Math.max(1, Math.ceil(viewport.width))
      buffer.height = Math.max(1, Math.ceil(viewport.height))
      const context = buffer.getContext('2d', { alpha: false })
      if (!context) throw new Error('Your browser could not prepare a canvas to render this page.')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, buffer.width, buffer.height)

      task = page.render({ canvas: buffer, canvasContext: context, viewport, intent: 'display' })
      await task.promise
      if (cancelled) return

      output.width = buffer.width
      output.height = buffer.height
      output.getContext('2d')?.drawImage(buffer, 0, 0)
      buffer.width = 0
      buffer.height = 0
    } finally {
      page.cleanup()
    }
  })()

  return {
    promise,
    cancel: () => {
      cancelled = true
      task?.cancel()
    },
  }
}
