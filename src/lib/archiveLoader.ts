import { unzip } from 'fflate'
import { classifyFile } from './fileKinds'

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
}

const baseName = (path: string) => path.split('/').pop() ?? path

// Only files the app can open are worth unpacking; folders, hidden files, macOS metadata and nested archives are skipped.
function isImportable(path: string): boolean {
  if (path.endsWith('/') || path.startsWith('__MACOSX/') || baseName(path).startsWith('.')) return false
  const kind = classifyFile({ name: path, type: '' })
  return kind === 'pdf' || kind === 'image' || kind === 'tiff'
}

// Opens a ZIP or CBZ and returns the PDFs and images inside as files, in natural page order (page2 before page10).
export async function extractArchive(file: File): Promise<File[]> {
  const data = new Uint8Array(await file.arrayBuffer())
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(data, { filter: (entry) => isImportable(entry.name) }, (error, result) =>
      error ? reject(error) : resolve(result),
    )
  }).catch(() => {
    throw new Error('This archive could not be opened. It may be damaged or not a ZIP file.')
  })

  const names = Object.keys(entries).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  if (names.length === 0) throw new Error('This archive does not contain any PDFs or images.')
  return names.map((path) => {
    const extension = path.split('.').pop()?.toLowerCase() ?? ''
    const bytes = entries[path]
    return new File([new Uint8Array(bytes).buffer], baseName(path), {
      type: MIME_BY_EXTENSION[extension] ?? '',
      lastModified: file.lastModified,
    })
  })
}
