import type { PDFDocument } from 'pdf-lib'
import type { PdfPage, UploadedPdf } from '../../types/pdf'
import { individualFilename, mergedFilename } from './filenames'
import { createMergedPdf } from './merged'

interface PreparedDragOut {
  signature: string
  url: string
  filename: string
}

const MAX_CACHED_SOURCES = 6
const URL_LIFETIME_MS = 60_000
const sourceDocuments = new Map<string, Promise<PDFDocument>>()
let prepared: PreparedDragOut | undefined
let pendingSignature: string | undefined

// Only Chromium lets a page hand a file to the desktop during a drag (the DownloadURL type).
const supportsDragOut = typeof navigator !== 'undefined' && 'userAgentData' in navigator

function signatureOf(pages: PdfPage[], filename?: string): string {
  return JSON.stringify([pages.map((page) => [page.id, page.rotation, page.label ?? null]), filename ?? null])
}

/** Builds the PDF in advance: a drag can only carry a file that already exists when it starts. */
export function prepareDragOut(pages: PdfPage[], pdfs: UploadedPdf[], filename?: string): void {
  if (!supportsDragOut || pages.length === 0) return
  const signature = signatureOf(pages, filename)
  if (prepared?.signature === signature || pendingSignature === signature) return

  if (sourceDocuments.size > MAX_CACHED_SOURCES) sourceDocuments.clear()
  pendingSignature = signature
  createMergedPdf(pages, pdfs, sourceDocuments).then(
    (bytes) => {
      if (pendingSignature !== signature) return
      const previous = prepared
      if (previous) window.setTimeout(() => URL.revokeObjectURL(previous.url), URL_LIFETIME_MS)
      prepared = {
        signature,
        url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })),
        filename:
          filename
            ? mergedFilename(filename)
            : pages.length === 1
            ? individualFilename(pages[0])
            : mergedFilename(`PDF Studio - ${pages.length} pages`),
      }
    },
    () => {
      if (pendingSignature === signature) pendingSignature = undefined
    },
  )
}

/** The `DownloadURL` payload for these pages, or undefined if the file is not built yet. */
export function readyDragOutPayload(pages: PdfPage[], filename?: string): string | undefined {
  if (prepared?.signature !== signatureOf(pages, filename)) return undefined
  return `application/pdf:${prepared.filename}:${prepared.url}`
}
