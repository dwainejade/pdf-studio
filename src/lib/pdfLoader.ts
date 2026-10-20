import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { generateThumbnail } from './thumbnailGenerator'
import type { PdfPage } from '../types/pdf'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export async function loadPdfPages(file: File, sourcePdfId: string): Promise<PdfPage[]> {
  let loadingTask: ReturnType<typeof pdfjs.getDocument> | undefined
  let document: pdfjs.PDFDocumentProxy | undefined

  try {
    const data = new Uint8Array(await file.arrayBuffer())
    loadingTask = pdfjs.getDocument({ data })
    document = await loadingTask.promise

    if (document.numPages === 0) {
      throw new Error('This PDF does not contain any pages.')
    }

    const pages: PdfPage[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const thumbnail = await generateThumbnail(page)
      pages.push({
        id: `${sourcePdfId}-${pageNumber}`,
        sourcePdfId,
        sourcePdfName: file.name,
        pageNumber,
        rotation: page.rotate,
        thumbnail,
      })
      page.cleanup()
    }

    return pages
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
