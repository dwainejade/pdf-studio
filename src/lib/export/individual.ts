import { PDFDocument } from 'pdf-lib'
import type { PageGroup, PdfPage, UploadedPdf } from '../../types/pdf'
import { appendStudioPage } from './common'
import { individualFilename, mergedFilename } from './filenames'

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
    const filename = individualFilename(page)
    ensureUniqueFilename(filename, filenames)
    exports.push(await createPdfExport([page], filename, pdfs, documentCache))
  }
  return exports
}

export async function createGroupPdfs(
  pagesInGridOrder: PdfPage[],
  pdfs: UploadedPdf[],
  groups: PageGroup[],
): Promise<IndividualPdfExport[]> {
  if (pagesInGridOrder.length === 0) {
    throw new Error('Select at least one page to export.')
  }

  const groupsById = new Map(groups.map((group) => [group.id, group]))
  const groupedPages = new Map<string, PdfPage[]>()
  const exportUnits: Array<{ pages: PdfPage[]; filename: string }> = []
  const filenames = new Set<string>()

  for (const page of pagesInGridOrder) {
    const group = page.groupId ? groupsById.get(page.groupId) : undefined
    if (!group) {
      const filename = individualFilename(page)
      ensureUniqueFilename(filename, filenames)
      exportUnits.push({ pages: [page], filename })
      continue
    }

    let members = groupedPages.get(group.id)
    if (!members) {
      members = []
      groupedPages.set(group.id, members)
      const filename = mergedFilename(group.name)
      ensureUniqueFilename(filename, filenames)
      exportUnits.push({ pages: members, filename })
    }
    members.push(page)
  }

  const documentCache = new Map<string, Promise<PDFDocument>>()
  const exports: IndividualPdfExport[] = []
  for (const { pages, filename } of exportUnits) {
    exports.push(await createPdfExport(pages, filename, pdfs, documentCache))
  }
  return exports
}

async function createPdfExport(
  pages: PdfPage[],
  filename: string,
  pdfs: UploadedPdf[],
  documentCache: Map<string, Promise<PDFDocument>>,
): Promise<IndividualPdfExport> {
  const output = await PDFDocument.create()
  for (const page of pages) {
    await appendStudioPage(output, page, pdfs, documentCache)
  }
  return { filename, bytes: await output.save() }
}

function ensureUniqueFilename(filename: string, filenames: Set<string>): void {
  const normalized = filename.toLocaleLowerCase()
  if (filenames.has(normalized)) {
    throw new Error(`More than one selected export uses "${filename}". Rename pages or groups so each export filename is unique.`)
  }
  filenames.add(normalized)
}
