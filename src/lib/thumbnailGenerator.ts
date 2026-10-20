import type { PDFPageProxy, PageViewport } from 'pdfjs-dist'

const MAX_THUMBNAIL_DIMENSION = 1600
const MAX_THUMBNAIL_PIXELS = 2_000_000
const MAX_FULL_DIMENSION = 6000
const MAX_FULL_PIXELS = 20_000_000

function deviceScale(): number {
  return Math.min(window.devicePixelRatio || 1, 3)
}

/** Scale that fits a page inside `target` CSS pixels at device resolution, within canvas memory limits. */
export function fitPageScale(
  unitViewport: PageViewport,
  target: { width: number; height: number },
  limits: { dimension: number; pixels: number },
): number {
  return Math.min(
    (target.width * deviceScale()) / unitViewport.width,
    (target.height * deviceScale()) / unitViewport.height,
    limits.dimension / Math.max(unitViewport.width, unitViewport.height),
    Math.sqrt(limits.pixels / (unitViewport.width * unitViewport.height)),
  )
}

export function fullPageScale(
  unitViewport: PageViewport,
  target: { width: number; height: number },
): number {
  return fitPageScale(unitViewport, target, { dimension: MAX_FULL_DIMENSION, pixels: MAX_FULL_PIXELS })
}

/** Renders a page just large enough for a card of `target` CSS pixels; no image encoding step. */
export async function generateThumbnailBitmap(
  page: PDFPageProxy,
  rotation: number,
  target: { width: number; height: number },
): Promise<ImageBitmap> {
  const unitViewport = page.getViewport({ scale: 1, rotation })
  const scale = fitPageScale(unitViewport, target, {
    dimension: MAX_THUMBNAIL_DIMENSION,
    pixels: MAX_THUMBNAIL_PIXELS,
  })
  const viewport = page.getViewport({ scale, rotation })
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { alpha: false })

  if (!context) {
    throw new Error('Your browser could not prepare a canvas to render this page.')
  }

  canvas.width = Math.max(1, Math.ceil(viewport.width))
  canvas.height = Math.max(1, Math.ceil(viewport.height))
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)

  try {
    await page.render({
      canvas,
      canvasContext: context,
      viewport,
      intent: 'display',
    }).promise

    return await createImageBitmap(canvas)
  } catch {
    throw new Error('A page could not be rendered. The PDF may be damaged.')
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}
