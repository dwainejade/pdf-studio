import { zip } from 'fflate'
import type { PdfPage, UploadedPdf } from '../../types/pdf'
import { individualFilename } from './filenames'
import { createMergedPdf } from './merged'
import { canvasToBytes, rasterizePdf } from './rasterize'

export type ImageFormat = 'png' | 'jpeg'

export const IMAGE_FORMAT_OPTIONS: Array<{ format: ImageFormat; title: string; detail: string }> = [
  { format: 'png', title: 'PNG', detail: 'Sharp text and lines; larger files' },
  { format: 'jpeg', title: 'JPG', detail: 'Smaller files; best for photos and scans' },
]

export const IMAGE_DPI_OPTIONS = [
  { dpi: 72, title: 'Screen', detail: '72 dpi: quick to share' },
  { dpi: 150, title: 'Standard', detail: '150 dpi: sharp on screen and email' },
  { dpi: 300, title: 'Print', detail: '300 dpi: large files' },
]

export interface ImageExport {
  filename: string
  bytes: Uint8Array
  mimeType: string
}

const JPEG_QUALITY = 0.92

// Pages are rendered from the same PDF the merged export would produce, so rotation and added text come out exactly as shown.
export async function createImageExports(
  pagesInGridOrder: PdfPage[],
  pdfs: UploadedPdf[],
  options: { format: ImageFormat; dpi: number },
  onProgress?: (done: number, total: number) => void,
): Promise<ImageExport[]> {
  if (pagesInGridOrder.length === 0) {
    throw new Error('Select at least one page to export.')
  }
  const pdf = await createMergedPdf(pagesInGridOrder, pdfs)
  const extension = options.format === 'png' ? 'png' : 'jpg'
  const mimeType = options.format === 'png' ? 'image/png' : 'image/jpeg'

  const used = new Set<string>()
  const filenameFor = (page: PdfPage) => {
    const base = individualFilename(page).replace(/\.pdf$/i, '')
    let name = base
    for (let copy = 2; used.has(name.toLocaleLowerCase()); copy += 1) name = `${base}_${copy}`
    used.add(name.toLocaleLowerCase())
    return `${name}.${extension}`
  }

  const exports: ImageExport[] = []
  await rasterizePdf(pdf, options.dpi, async ({ canvas, number, total }) => {
    const page = pagesInGridOrder[number - 1]
    exports.push({
      filename: filenameFor(page),
      bytes: await canvasToBytes(canvas, mimeType as 'image/png' | 'image/jpeg', options.format === 'jpeg' ? JPEG_QUALITY : undefined),
      mimeType,
    })
    onProgress?.(number, total)
  })
  return exports
}

// Images are already compressed, so the archive only stores them.
export function zipImageExports(files: ImageExport[]): Promise<Uint8Array> {
  const entries: Record<string, Uint8Array> = {}
  for (const file of files) entries[file.filename] = file.bytes
  return new Promise((resolve, reject) => {
    zip(entries, { level: 0 }, (error, data) => (error ? reject(error) : resolve(data)))
  })
}
