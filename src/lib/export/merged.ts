import { PDFDocument } from 'pdf-lib'
import type { PdfPage, UploadedPdf } from '../../types/pdf'
import { appendStudioPage } from './common'

export async function createMergedPdf(
  pagesInGridOrder: PdfPage[],
  pdfs: UploadedPdf[],
  documentCache: Map<string, Promise<PDFDocument>> = new Map(),
): Promise<Uint8Array> {
  if (pagesInGridOrder.length === 0) {
    throw new Error('Select at least one page to export.')
  }

  const output = await PDFDocument.create()
  for (const page of pagesInGridOrder) {
    await appendStudioPage(output, page, pdfs, documentCache)
  }
  return output.save()
}
