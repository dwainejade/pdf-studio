import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFJS_ASSET_OPTIONS } from '../pdfjsOptions'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// Keeps one huge page from exhausting canvas memory.
const MAX_CANVAS_SIDE = 4096

export interface RasterPage {
  canvas: HTMLCanvasElement
  /** 1-based page number. */
  number: number
  total: number
  /** Page size in PDF points, before scaling to the chosen resolution. */
  widthPt: number
  heightPt: number
}

// Renders each page of a PDF to a canvas at the given resolution, one at a time, and hands it to `onPage`.
// The canvas is released as soon as `onPage` returns.
export async function rasterizePdf(
  bytes: Uint8Array,
  dpi: number,
  onPage: (page: RasterPage) => Promise<void>,
  maxSide = MAX_CANVAS_SIDE,
): Promise<void> {
  const task = pdfjs.getDocument({ data: bytes.slice(), ...PDFJS_ASSET_OPTIONS })
  try {
    const source = await task.promise
    for (let number = 1; number <= source.numPages; number += 1) {
      const page = await source.getPage(number)
      const sizePt = page.getViewport({ scale: 1 })
      const scale = Math.min(dpi / 72, maxSide / Math.max(sizePt.width, sizePt.height))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(viewport.width))
      canvas.height = Math.max(1, Math.round(viewport.height))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('A page could not be rendered.')
      // Images and JPEG have no transparency, so pages are painted onto white first.
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: context, viewport, canvas }).promise
      try {
        await onPage({ canvas, number, total: source.numPages, widthPt: sizePt.width, heightPt: sizePt.height })
      } finally {
        canvas.width = 0
        canvas.height = 0
        page.cleanup()
      }
    }
  } finally {
    await task.destroy()
  }
}

export function canvasToBytes(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality?: number) {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('A page could not be encoded.'))
        void blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject)
      },
      type,
      quality,
    )
  })
}
