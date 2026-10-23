import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy, PageViewport, RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFJS_ASSET_OPTIONS } from './pdfjsOptions'
import { fullPageScale, generateThumbnailBitmap } from './thumbnailGenerator'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const MAX_CACHED_THUMBNAILS = 160
const MAX_THUMBNAIL_CACHE_BYTES = 96 * 1024 * 1024
const MAX_CONCURRENT_RENDERS = Math.min(
  4,
  Math.max(2, Math.floor((navigator.hardwareConcurrency || 4) / 2)),
)
const documentCache = new Map<string, Promise<PDFDocumentProxy>>()

class RenderCancelledError extends Error {
  constructor() {
    super('Render cancelled')
    this.name = 'RenderCancelledError'
  }
}

interface QueuedRender {
  priority: () => number
  start: () => void
  cancel: () => void
}

const renderQueue: QueuedRender[] = []
let activeRenders = 0

/** Starts the waiting render whose card is closest to the middle of the screen. */
function pumpRenderQueue(): void {
  while (activeRenders < MAX_CONCURRENT_RENDERS && renderQueue.length > 0) {
    let bestIndex = 0
    let bestPriority = renderQueue[0].priority()
    for (let index = 1; index < renderQueue.length; index += 1) {
      const priority = renderQueue[index].priority()
      if (priority < bestPriority) {
        bestPriority = priority
        bestIndex = index
      }
    }
    const [next] = renderQueue.splice(bestIndex, 1)
    activeRenders += 1
    next.start()
  }
}

function enqueueRender<T>(
  priority: () => number,
  work: () => Promise<T>,
): { promise: Promise<T>; cancel: () => void; hasStarted: () => boolean } {
  let started = false
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((resolve, rejectPromise) => {
    reject = rejectPromise
    const job: QueuedRender = {
      priority,
      start: () => {
        started = true
        work()
          .then(resolve, rejectPromise)
          .finally(() => {
            activeRenders -= 1
            pumpRenderQueue()
          })
      },
      cancel: () => rejectPromise(new RenderCancelledError()),
    }
    renderQueue.push(job)
    pumpRenderQueue()
  })
  return {
    promise,
    hasStarted: () => started,
    cancel: () => {
      const index = renderQueue.findIndex((job) => job.priority === priority)
      if (index >= 0) renderQueue.splice(index, 1)
      reject(new RenderCancelledError())
    },
  }
}

function getDocument(sourcePdfId: string, file: File): Promise<PDFDocumentProxy> {
  const existing = documentCache.get(sourcePdfId)
  if (existing) {
    documentCache.delete(sourcePdfId)
    documentCache.set(sourcePdfId, existing)
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

interface ThumbnailEntry {
  promise: Promise<ImageBitmap>
  pageKey: string
  bitmap?: ImageBitmap
  bytes: number
  consumers: number
  cancel: () => void
  hasStarted: () => boolean
}

const thumbnailCache = new Map<string, ThumbnailEntry>()
const latestKeyByPage = new Map<string, string>()
let cachedThumbnailBytes = 0

function dropEntry(key: string): void {
  const entry = thumbnailCache.get(key)
  if (!entry) return
  thumbnailCache.delete(key)
  cachedThumbnailBytes -= entry.bytes
  entry.bitmap?.close()
  if (latestKeyByPage.get(entry.pageKey) === key) latestKeyByPage.delete(entry.pageKey)
}

function trimThumbnailCache(): void {
  for (const key of thumbnailCache.keys()) {
    if (
      thumbnailCache.size <= MAX_CACHED_THUMBNAILS &&
      cachedThumbnailBytes <= MAX_THUMBNAIL_CACHE_BYTES
    ) {
      break
    }
    // Entries still being rendered or in use by a card are kept.
    const entry = thumbnailCache.get(key)
    if (entry?.bitmap && entry.consumers === 0) dropEntry(key)
  }
}

export interface ThumbnailRequest {
  promise: Promise<ImageBitmap>
  /** Call when the card no longer needs the image; unstarted renders are dropped. */
  release: () => void
}

/**
 * Loads a page image sized for a card. `box` is the card's CSS size; `priority` returns a
 * smaller number the sooner the page should render (distance from the viewport centre).
 */
export function loadPageBitmap(
  sourcePdfId: string,
  file: File,
  pageNumber: number,
  rotation: number,
  box: { width: number; height: number },
  priority: () => number,
): ThumbnailRequest {
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  const pageKey = `${sourcePdfId}:${pageNumber}:${rotation}`
  const key = `${pageKey}:${box.width}x${box.height}:${dpr}`
  let entry = thumbnailCache.get(key)

  if (!entry) {
    const queued = enqueueRender(priority, async () => {
      const page = await getDocument(sourcePdfId, file).then((pdfDocument) =>
        pdfDocument.getPage(pageNumber),
      )
      try {
        return await generateThumbnailBitmap(page, rotation, box)
      } finally {
        page.cleanup()
      }
    })
    const created: ThumbnailEntry = {
      promise: queued.promise,
      pageKey,
      bytes: 0,
      consumers: 0,
      cancel: queued.cancel,
      hasStarted: queued.hasStarted,
    }
    entry = created
    thumbnailCache.set(key, created)
    queued.promise.then(
      (bitmap) => {
        if (thumbnailCache.get(key) !== created) {
          bitmap.close()
          return
        }
        created.bitmap = bitmap
        created.bytes = bitmap.width * bitmap.height * 4
        cachedThumbnailBytes += created.bytes
        latestKeyByPage.set(pageKey, key)
        trimThumbnailCache()
      },
      () => {
        if (thumbnailCache.get(key) === created) thumbnailCache.delete(key)
      },
    )
  } else {
    // Refresh recency so the oldest entries are the ones trimmed.
    thumbnailCache.delete(key)
    thumbnailCache.set(key, entry)
  }

  const active = entry
  active.consumers += 1
  let released = false
  return {
    promise: active.promise,
    release: () => {
      if (released) return
      released = true
      active.consumers -= 1
      if (active.consumers === 0 && !active.hasStarted() && !active.bitmap) {
        active.cancel()
        if (thumbnailCache.get(key) === active) thumbnailCache.delete(key)
      }
    },
  }
}

/** Any already-rendered thumbnail of this page, for a quick placeholder; never starts a render. */
export function peekPageBitmap(
  sourcePdfId: string,
  pageNumber: number,
  rotation: number,
): ImageBitmap | undefined {
  const key = latestKeyByPage.get(`${sourcePdfId}:${pageNumber}:${rotation}`)
  return key ? thumbnailCache.get(key)?.bitmap : undefined
}

export function isRenderCancelled(error: unknown): boolean {
  return error instanceof RenderCancelledError
}

export interface FullPageRender {
  promise: Promise<void>
  cancel: () => void
  /** True once the sharp render has been drawn to the output canvas. */
  isDrawn: () => boolean
}

export interface FullPageTextLayer {
  textContent: Awaited<ReturnType<PDFPageProxy['getTextContent']>>
  viewport: PageViewport
}

/** Loads selectable text at the same scale and rotation used by `renderFullPage`. */
export async function loadFullPageTextLayer(
  sourcePdfId: string,
  file: File,
  pageNumber: number,
  rotation: number,
  target: { width: number; height: number },
): Promise<FullPageTextLayer> {
  const pdfDocument = await getDocument(sourcePdfId, file)
  const page = await pdfDocument.getPage(pageNumber)
  const unitViewport = page.getViewport({ scale: 1, rotation })
  const viewport = page.getViewport({
    scale: fullPageScale(unitViewport, target),
    rotation,
  })

  try {
    return { textContent: await page.getTextContent(), viewport }
  } finally {
    page.cleanup()
  }
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
  let drawn = false
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
      drawn = true
      buffer.width = 0
      buffer.height = 0
    } finally {
      page.cleanup()
    }
  })()

  return {
    promise,
    isDrawn: () => drawn,
    cancel: () => {
      cancelled = true
      task?.cancel()
    },
  }
}

const baseRotationByPage = new Map<string, number>()

/**
 * The rotation a page's grid thumbnail was first rendered at. Later rotations are shown by
 * turning that image rather than rendering again, so the cached image stays valid.
 */
export function thumbnailBaseRotation(
  sourcePdfId: string,
  pageNumber: number,
  currentRotation: number,
): number {
  const key = `${sourcePdfId}:${pageNumber}`
  const existing = baseRotationByPage.get(key)
  if (existing !== undefined) return existing
  baseRotationByPage.set(key, currentRotation)
  return currentRotation
}
