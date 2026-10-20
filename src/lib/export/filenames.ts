import type { PdfPage } from '../../types/pdf'

export function normalizePdfFilename(filename: string): string {
  const withoutControlCharacters = Array.from(filename, (character) =>
    character.charCodeAt(0) < 32 ? '_' : character,
  ).join('')
  const safe = withoutControlCharacters
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
  return safe || 'Document.pdf'
}

export function mergedFilename(filename: string): string {
  const withoutExtension = filename.trim().replace(/\.pdf$/i, '')
  return `${normalizePdfFilename(withoutExtension)}.pdf`
}

export function individualFilename(page: PdfPage): string {
  const label = page.label?.trim()
  if (label) {
    return `${normalizePdfFilename(label.replace(/\.pdf$/i, ''))}.pdf`
  }
  const sourceName = page.sourcePdfName.replace(/\.pdf$/i, '')
  return normalizePdfFilename(`${sourceName}_Page_${page.pageNumber}.pdf`)
}
