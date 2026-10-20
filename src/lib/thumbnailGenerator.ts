import type { PDFPageProxy } from 'pdfjs-dist'

const MAX_THUMBNAIL_WIDTH = 320
const MAX_THUMBNAIL_HEIGHT = 420

export async function generateThumbnail(page: PDFPageProxy): Promise<string> {
  const viewport = page.getViewport({ scale: 1 })
  const scale = Math.min(
    1,
    MAX_THUMBNAIL_WIDTH / viewport.width,
    MAX_THUMBNAIL_HEIGHT / viewport.height,
  )
  const scaledViewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { alpha: false })

  if (!context) {
    throw new Error('Your browser could not prepare a canvas to render this page.')
  }

  canvas.width = Math.max(1, Math.ceil(scaledViewport.width))
  canvas.height = Math.max(1, Math.ceil(scaledViewport.height))
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)

  try {
    await page.render({
      canvas,
      canvasContext: context,
      viewport: scaledViewport,
    }).promise

    return canvas.toDataURL('image/jpeg', 0.84)
  } catch {
    throw new Error('A page could not be rendered. The PDF may be damaged.')
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}
