import { degrees, PDFDocument, type PDFPage } from 'pdf-lib'
import type { PdfPage as StudioPage, UploadedPdf } from '../../types/pdf'

export function applyPageRotation(page: PDFPage, rotation: number): void {
  const normalized = ((rotation % 360) + 360) % 360
  page.setRotation(degrees(normalized))
}

export function findSourcePdf(page: StudioPage, pdfs: UploadedPdf[]): UploadedPdf {
  const source = pdfs.find((pdf) => pdf.id === page.sourcePdfId)
  if (!source) {
    throw new Error(`The original PDF for "${page.sourcePdfName}" is no longer available.`)
  }
  return source
}

export async function loadSourceDocument(
  source: UploadedPdf,
  documentCache: Map<string, Promise<PDFDocument>>,
): Promise<PDFDocument> {
  let document = documentCache.get(source.id)
  if (!document) {
    document = source.file.arrayBuffer().then((bytes) => PDFDocument.load(bytes))
    documentCache.set(source.id, document)
  }
  return document
}
