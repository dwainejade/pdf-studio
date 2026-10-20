import { PDFDocument } from 'pdf-lib'
import type { PdfPage, UploadedPdf } from '../../types/pdf'
import { applyPageRotation, findSourcePdf, loadSourceDocument } from './common'

export async function createMergedPdf(
  pagesInGridOrder: PdfPage[],
  pdfs: UploadedPdf[],
): Promise<Uint8Array> {
  if (pagesInGridOrder.length === 0) {
    throw new Error('Select at least one page to export.')
  }

  const output = await PDFDocument.create()
  const documentCache = new Map()
  for (const page of pagesInGridOrder) {
    const source = findSourcePdf(page, pdfs)
    const sourceDocument = await loadSourceDocument(source, documentCache)
    const [copiedPage] = await output.copyPages(sourceDocument, [page.pageNumber - 1])
    applyPageRotation(copiedPage, page.rotation)
    output.addPage(copiedPage)
  }
  return output.save()
}
