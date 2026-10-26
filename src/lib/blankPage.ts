import { PDFDocument } from 'pdf-lib'
import type { PdfPage, UploadedPdf } from '../types/pdf'

export const A4_WIDTH = 595.28
export const A4_HEIGHT = 841.89

// A blank page is a real one-page source PDF, so thumbnails, export, drag-out and persistence need no special case.
export async function createBlankPage(
  width = A4_WIDTH,
  height = A4_HEIGHT,
): Promise<{ source: UploadedPdf; page: PdfPage }> {
  const output = await PDFDocument.create()
  output.addPage([width, height])
  const bytes = await output.save()
  const fileBytes = new Uint8Array(bytes.byteLength)
  fileBytes.set(bytes)

  const id = crypto.randomUUID()
  const name = 'Blank page.pdf'
  return {
    source: {
      id,
      name,
      file: new File([fileBytes.buffer], name, { type: 'application/pdf' }),
      importedAt: new Date().toISOString(),
      totalPages: 1,
      metadata: {
        title: 'Blank page',
        author: '',
        subject: '',
        keywords: '',
        creationDate: '',
        modificationDate: '',
        creator: '',
        producer: '',
        version: '',
      },
      sourceType: 'blank',
      sourceSize: fileBytes.byteLength,
    },
    page: {
      id: `${id}-1`,
      sourcePdfId: id,
      sourcePdfName: name,
      pageNumber: 1,
      rotation: 0,
      thumbnail: '',
      width,
      height,
      label: 'Blank page',
    },
  }
}
