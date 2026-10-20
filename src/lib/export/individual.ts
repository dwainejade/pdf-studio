import { PDFDocument } from 'pdf-lib'
import type { PdfPage, UploadedPdf } from '../../types/pdf'
import {
  applyPageRotation,
  findSourcePdf,
  loadSourceDocument,
} from './common'
import { individualFilename } from './filenames'

export interface IndividualPdfExport {
  filename: string
  bytes: Uint8Array
}

export async function createIndividualPdfs(
  pagesInGridOrder: PdfPage[],
  pdfs: UploadedPdf[],
): Promise<IndividualPdfExport[]> {
  if (pagesInGridOrder.length === 0) {
    throw new Error('Select at least one page to export.')
  }

  const documentCache = new Map()
  const exports: IndividualPdfExport[] = []
  const filenames = new Set<string>()
  for (const page of pagesInGridOrder) {
    const source = findSourcePdf(page, pdfs)
    const sourceDocument = await loadSourceDocument(source, documentCache)
    const output = await PDFDocument.create()
    const [copiedPage] = await output.copyPages(sourceDocument, [page.pageNumber - 1])
    applyPageRotation(copiedPage, page.rotation)
    output.addPage(copiedPage)
    const filename = individualFilename(page)
    if (filenames.has(filename.toLocaleLowerCase())) {
      throw new Error(`More than one selected page uses "${filename}". Rename pages so each export filename is unique.`)
    }
    filenames.add(filename.toLocaleLowerCase())
    exports.push({
      filename,
      bytes: await output.save(),
    })
  }
  return exports
}
