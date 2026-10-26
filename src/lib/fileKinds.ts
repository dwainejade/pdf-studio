export type FileKind = 'pdf' | 'image' | 'tiff' | 'archive' | 'unsupported'

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|bmp|avif|svg)$/i
const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|bmp|x-ms-bmp|avif|svg\+xml)$/i
const ARCHIVE_EXTENSIONS = /\.(zip|cbz)$/i
const ARCHIVE_TYPES = /^application\/(zip|x-zip-compressed|vnd\.comicbook\+zip)$/i

// Decides how a file is imported, from its type or its name (browsers often leave the type empty).
export function classifyFile(file: Pick<File, 'name' | 'type'>): FileKind {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf'
  if (/^image\/tiff$/i.test(file.type) || /\.tiff?$/i.test(file.name)) return 'tiff'
  if (IMAGE_TYPES.test(file.type) || IMAGE_EXTENSIONS.test(file.name)) return 'image'
  if (ARCHIVE_TYPES.test(file.type) || ARCHIVE_EXTENSIONS.test(file.name)) return 'archive'
  return 'unsupported'
}

// Dropzone accept map: the types the app can open.
export const ACCEPTED_FILES = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'image/bmp': ['.bmp'],
  'image/avif': ['.avif'],
  'image/svg+xml': ['.svg'],
  'image/tiff': ['.tif', '.tiff'],
  'application/zip': ['.zip'],
  'application/x-zip-compressed': ['.zip'],
  'application/vnd.comicbook+zip': ['.cbz'],
}

export const UNSUPPORTED_MESSAGE =
  'Supported files are PDF, JPEG, PNG, WebP, GIF, BMP, AVIF, SVG, TIFF, and ZIP or CBZ archives.'
