import type { PDFPageProxy } from 'pdfjs-dist'

const MAX_RENDER_DIMENSION = 1800
const MAX_RENDER_PIXELS = 3_000_000

export async function generateThumbnail(
  page: PDFPageProxy,
  rotation: number,
): Promise<string> {
  const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 3)
  const unitViewport = page.getViewport({ scale: 1, rotation })
  const resolutionScale = 2 * devicePixelRatio
  const dimensionScale =
    MAX_RENDER_DIMENSION / Math.max(unitViewport.width, unitViewport.height)
  const pixelScale = Math.sqrt(
    MAX_RENDER_PIXELS / (unitViewport.width * unitViewport.height),
  )
  const scale = Math.min(resolutionScale, dimensionScale, pixelScale)
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

    return canvas.toDataURL('image/png')
  } catch {
    throw new Error('A page could not be rendered. The PDF may be damaged.')
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}
