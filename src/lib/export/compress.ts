import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFDocument } from 'pdf-lib'
import { PDFJS_ASSET_OPTIONS } from '../pdfjsOptions'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type CompressionLevel = 'none' | 'balanced' | 'small'

export const COMPRESSION_OPTIONS: Array<{
  level: CompressionLevel
  title: string
  detail: string
}> = [
  { level: 'none', title: 'Original quality', detail: 'Keeps text selectable and images untouched' },
  { level: 'balanced', title: 'Smaller file', detail: 'Pages become 150 dpi images; text is no longer selectable' },
  { level: 'small', title: 'Smallest file', detail: 'Pages become 110 dpi images; best for scans and sharing' },
]

const PRESETS = {
  balanced: { dpi: 150, quality: 0.8 },
  small: { dpi: 110, quality: 0.6 },
} as const

// Keeps one huge page from exhausting canvas memory.
const MAX_CANVAS_SIDE = 4096

export interface CompressionResult {
  bytes: Uint8Array
  originalSize: number
  /** False when re-encoding would not have made the file smaller, so the original was kept. */
  wasReduced: boolean
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('A page could not be compressed.'))
        void blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject)
      },
      'image/jpeg',
      quality,
    )
  })
}

// Re-renders every page as a JPEG at the preset's resolution and rebuilds the PDF from those images.
export async function compressPdf(
  bytes: Uint8Array,
  level: CompressionLevel,
  onProgress?: (done: number, total: number) => void,
): Promise<CompressionResult> {
  const unchanged = { bytes, originalSize: bytes.byteLength, wasReduced: false }
  if (level === 'none') return unchanged

  const { dpi, quality } = PRESETS[level]
  const task = pdfjs.getDocument({ data: bytes.slice(), ...PDFJS_ASSET_OPTIONS })
  try {
    const source = await task.promise
    const output = await PDFDocument.create()
    for (let number = 1; number <= source.numPages; number += 1) {
      const page = await source.getPage(number)
      const sizePt = page.getViewport({ scale: 1 })
      const scale = Math.min(dpi / 72, MAX_CANVAS_SIDE / Math.max(sizePt.width, sizePt.height))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(viewport.width))
      canvas.height = Math.max(1, Math.round(viewport.height))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('A page could not be compressed.')
      // JPEG has no transparency, so pages are painted onto white first.
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: context, viewport, canvas }).promise
      const image = await output.embedJpg(await canvasToJpeg(canvas, quality))
      const target = output.addPage([sizePt.width, sizePt.height])
      target.drawImage(image, { x: 0, y: 0, width: sizePt.width, height: sizePt.height })
      canvas.width = 0
      canvas.height = 0
      page.cleanup()
      onProgress?.(number, source.numPages)
    }
    const compressed = await output.save()
    // A mostly-text file can grow when turned into images; keep whichever is smaller.
    return compressed.byteLength < bytes.byteLength
      ? { bytes: compressed, originalSize: bytes.byteLength, wasReduced: true }
      : unchanged
  } finally {
    await task.destroy()
  }
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
