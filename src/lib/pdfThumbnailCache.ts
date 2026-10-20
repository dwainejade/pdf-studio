import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { generateThumbnail } from './thumbnailGenerator'

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
    pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise,
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
