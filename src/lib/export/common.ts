import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import type { PdfPage as StudioPage, UploadedPdf } from '../../types/pdf'
import { TEXT_LINE_HEIGHT } from '../pageText'

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

const fontCache = new WeakMap<PDFDocument, Promise<PDFFont>>()

function outputFont(output: PDFDocument): Promise<PDFFont> {
  let font = fontCache.get(output)
  if (!font) {
    font = output.embedFont(StandardFonts.Helvetica)
    fontCache.set(output, font)
  }
  return font
}

// Standard PDF fonts only hold Latin-1 style characters; anything else becomes "?" instead of failing the export.
function encodable(font: PDFFont, text: string): string {
  return Array.from(text, (character) => {
    try {
      font.encodeText(character)
      return character
    } catch {
      return '?'
    }
  }).join('')
}

function hexColor(color: string) {
  const value = Number.parseInt(color.replace('#', ''), 16)
  return Number.isNaN(value)
    ? rgb(0, 0, 0)
    : rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255)
}

// Fractions are of the unrotated page, so text is drawn before the page's rotation is applied.
async function drawPageText(output: PDFDocument, target: PDFPage, page: StudioPage): Promise<void> {
  if (!page.textBoxes?.length) return
  const font = await outputFont(output)
  const { width, height } = target.getSize()
  // Where CSS puts the first baseline inside a line box of TEXT_LINE_HEIGHT.
  const baselineOffset = (TEXT_LINE_HEIGHT - 1.117) / 2 + 0.905
  for (const box of page.textBoxes) {
    encodable(font, box.text)
      .split('\n')
      .forEach((line, index) => {
        if (!line) return
        target.drawText(line, {
          x: box.x * width,
          y: height - box.y * height - (baselineOffset + index * TEXT_LINE_HEIGHT) * box.fontSize,
          size: box.fontSize,
          font,
          color: hexColor(box.color),
        })
      })
  }
}

// Copies one studio page into the output with its rotation and any text added on it.
export async function appendStudioPage(
  output: PDFDocument,
  page: StudioPage,
  pdfs: UploadedPdf[],
  documentCache: Map<string, Promise<PDFDocument>>,
): Promise<void> {
  const source = findSourcePdf(page, pdfs)
  const sourceDocument = await loadSourceDocument(source, documentCache)
  const [copiedPage] = await output.copyPages(sourceDocument, [page.pageNumber - 1])
  // Text is placed against the page as stored, so draw it before turning the page.
  copiedPage.setRotation(degrees(0))
  await drawPageText(output, copiedPage, page)
  applyPageRotation(copiedPage, page.rotation)
  output.addPage(copiedPage)
}
