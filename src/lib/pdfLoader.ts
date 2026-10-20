import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PdfMetadata, PdfPage } from '../types/pdf'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export interface LoadedPdf {
  pages: PdfPage[]
  metadata: PdfMetadata
  totalPages: number
}

function metadataText(...values: unknown[]): string {
  const value = values.find(
    (candidate) => typeof candidate === 'string' && candidate.trim().length > 0,
  )
  return typeof value === 'string' ? value.trim() : ''
}

function formatPdfDate(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return ''
  const pdfDate = value.match(/^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/)
  const date = pdfDate
    ? new Date(
        Number(pdfDate[1]),
        Number(pdfDate[2] || 1) - 1,
        Number(pdfDate[3] || 1),
        Number(pdfDate[4] || 0),
        Number(pdfDate[5] || 0),
        Number(pdfDate[6] || 0),
      )
    : new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export async function loadPdfPages(file: File, sourcePdfId: string): Promise<LoadedPdf> {
  let loadingTask: ReturnType<typeof pdfjs.getDocument> | undefined
  let document: pdfjs.PDFDocumentProxy | undefined

  try {
    const data = new Uint8Array(await file.arrayBuffer())
    loadingTask = pdfjs.getDocument({ data })
    document = await loadingTask.promise

    if (document.numPages === 0) {
      throw new Error('This PDF does not contain any pages.')
    }

    const { info, metadata: xmpMetadata } = await document.getMetadata()
    const infoFields = info as Record<string, unknown>
    const xmp = xmpMetadata as { get: (name: string) => unknown } | null
    const metadata: PdfMetadata = {
      title: metadataText(infoFields.Title, xmp?.get('dc:title')),
      author: metadataText(infoFields.Author, xmp?.get('dc:creator')),
      subject: metadataText(infoFields.Subject, xmp?.get('dc:description')),
      keywords: metadataText(infoFields.Keywords, xmp?.get('pdf:Keywords')),
      creationDate: formatPdfDate(infoFields.CreationDate ?? xmp?.get('xmp:CreateDate')),
      modificationDate: formatPdfDate(infoFields.ModDate ?? xmp?.get('xmp:ModifyDate')),
      creator: metadataText(infoFields.Creator, xmp?.get('xmp:CreatorTool')),
      producer: metadataText(infoFields.Producer),
      version: metadataText(infoFields.PDFFormatVersion),
    }

    const pages: PdfPage[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      pages.push({
        id: `${sourcePdfId}-${pageNumber}`,
        sourcePdfId,
        sourcePdfName: file.name,
        pageNumber,
        rotation: page.rotate,
        thumbnail: '',
        width: page.getViewport({ scale: 1, rotation: page.rotate }).width,
        height: page.getViewport({ scale: 1, rotation: page.rotate }).height,
      })
      page.cleanup()
    }

    return { pages, metadata, totalPages: document.numPages }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('A page could not be rendered')) {
      throw error
    }
    if (error instanceof Error && error.message.startsWith('Your browser could not prepare')) {
      throw error
    }
    throw new Error('This file could not be read as a PDF. It may be damaged or password-protected.')
  } finally {
    await loadingTask?.destroy()
  }
}
