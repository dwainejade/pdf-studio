import { PDFDocument } from 'pdf-lib'
import { canvasToBytes, rasterizePdf } from './rasterize'

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

export interface CompressionResult {
  bytes: Uint8Array
  originalSize: number
  /** False when re-encoding would not have made the file smaller, so the original was kept. */
  wasReduced: boolean
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
  const output = await PDFDocument.create()
  await rasterizePdf(bytes, dpi, async ({ canvas, number, total, widthPt, heightPt }) => {
    const image = await output.embedJpg(await canvasToBytes(canvas, 'image/jpeg', quality))
    const target = output.addPage([widthPt, heightPt])
    target.drawImage(image, { x: 0, y: 0, width: widthPt, height: heightPt })
    onProgress?.(number, total)
  })
  const compressed = await output.save()
  // A mostly-text file can grow when turned into images; keep whichever is smaller.
  return compressed.byteLength < bytes.byteLength
    ? { bytes: compressed, originalSize: bytes.byteLength, wasReduced: true }
    : unchanged
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
