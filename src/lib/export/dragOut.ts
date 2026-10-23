import type { PDFDocument } from 'pdf-lib'
import { zipSync } from 'fflate'
import type { PdfPage, UploadedPdf } from '../../types/pdf'
import { individualFilename, mergedFilename } from './filenames'
import { createMergedPdf } from './merged'

interface PreparedDragOut {
  signature: string
  url: string
  filename: string
  mimeType: string
}

const MAX_CACHED_SOURCES = 6
const URL_LIFETIME_MS = 60_000
const sourceDocuments = new Map<string, Promise<PDFDocument>>()
let prepared: PreparedDragOut | undefined
let pendingSignature: string | undefined

// Only Chromium lets a page hand generated files to the desktop during a drag.
const supportsDragOut = typeof navigator !== 'undefined' && 'userAgentData' in navigator

function signatureOf(pages: PdfPage[], filename?: string): string {
  return JSON.stringify([pages.map((page) => [page.id, page.rotation, page.label ?? null]), filename ?? null])
}

export interface DragOutFileRequest {
  pages: PdfPage[]
  filename?: string
}

/** Builds the PDF in advance: a drag can only carry a file that already exists when it starts. */
export function prepareDragOut(pages: PdfPage[], pdfs: UploadedPdf[], filename?: string): void {
  prepareDragOutFiles([{ pages, filename }], pdfs)
}

/** Builds each requested PDF in advance so a drag can hand multiple files to the desktop. */
export function prepareDragOutFiles(files: DragOutFileRequest[], pdfs: UploadedPdf[]): void {
  if (!supportsDragOut || files.length === 0 || files.some(({ pages }) => pages.length === 0)) return
  const signature = JSON.stringify(files.map(({ pages, filename }) => signatureOf(pages, filename)))
  if (prepared?.signature === signature || pendingSignature === signature) return

  if (sourceDocuments.size > MAX_CACHED_SOURCES) sourceDocuments.clear()
  pendingSignature = signature
  Promise.all(files.map(async ({ pages, filename }) => ({
    bytes: await createMergedPdf(pages, pdfs, sourceDocuments),
    filename:
      filename
        ? mergedFilename(filename)
        : pages.length === 1
          ? individualFilename(pages[0])
          : mergedFilename(`PDF Studio - ${pages.length} pages`),
  }))).then(
    (outputs) => {
      if (pendingSignature !== signature) return
      const previous = prepared
      if (previous) window.setTimeout(() => URL.revokeObjectURL(previous.url), URL_LIFETIME_MS)
      const uniqueOutputs = withUniqueFilenames(outputs)
      const isArchive = uniqueOutputs.length > 1
      const blob = isArchive
        ? new Blob(
            [zipSync(Object.fromEntries(uniqueOutputs.map(({ bytes, filename }) => [filename, bytes]))) as BlobPart],
            { type: 'application/zip' },
          )
        : new Blob([uniqueOutputs[0].bytes as BlobPart], { type: 'application/pdf' })
      prepared = {
        signature,
        url: URL.createObjectURL(blob),
        filename: isArchive ? `PDF Studio - ${uniqueOutputs.length} files.zip` : uniqueOutputs[0].filename,
        mimeType: isArchive ? 'application/zip' : 'application/pdf',
      }
    },
    () => {
      if (pendingSignature === signature) pendingSignature = undefined
    },
  )
}

/** The `DownloadURL` payload for these pages, or undefined if the file is not built yet. */
export function readyDragOutPayload(pages: PdfPage[], filename?: string): string | undefined {
  return readyDragOutFilesPayload([{ pages, filename }])
}

/** Desktop drag-out supports one DownloadURL, so bundle multiple outputs into a ZIP. */
export function readyDragOutFilesPayload(files: DragOutFileRequest[]): string | undefined {
  const signature = JSON.stringify(files.map(({ pages, filename }) => signatureOf(pages, filename)))
  if (prepared?.signature !== signature) return undefined
  return `${prepared.mimeType}:${prepared.filename}:${prepared.url}`
}

function withUniqueFilenames<T extends { filename: string }>(outputs: T[]): T[] {
  const used = new Set<string>()
  return outputs.map((output) => {
    const dot = output.filename.lastIndexOf('.')
    const stem = dot > 0 ? output.filename.slice(0, dot) : output.filename
    const extension = dot > 0 ? output.filename.slice(dot) : ''
    let filename = output.filename
    let suffix = 2
    while (used.has(filename.toLocaleLowerCase())) {
      filename = `${stem} (${suffix})${extension}`
      suffix += 1
    }
    used.add(filename.toLocaleLowerCase())
    return { ...output, filename }
  })
}
