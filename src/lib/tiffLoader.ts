import { PDFDocument } from 'pdf-lib'
import * as UTIF from 'utif2'
import type { PdfPage, UploadedPdf } from '../types/pdf'
import { addImagePage } from './imagePdfLoader'

const JPEG_QUALITY = 0.9

// A TIFF frame as a flat JPEG: scans are usually photos or text, and JPEG keeps the page small.
async function frameToJpeg(ifd: UTIF.IFD): Promise<Uint8Array> {
  const rgba = UTIF.toRGBA8(ifd)
  const source = document.createElement('canvas')
  source.width = ifd.width
  source.height = ifd.height
  source.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(rgba), ifd.width, ifd.height), 0, 0)
  // JPEG has no transparency, so frames are laid over white.
  const flat = document.createElement('canvas')
  flat.width = ifd.width
  flat.height = ifd.height
  const context = flat.getContext('2d')
  if (!context) throw new Error('A TIFF page could not be converted.')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, flat.width, flat.height)
  context.drawImage(source, 0, 0)
  source.width = 0
  source.height = 0
  const blob = await new Promise<Blob | null>((resolve) => flat.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  flat.width = 0
  flat.height = 0
  if (!blob) throw new Error('A TIFF page could not be converted.')
  return new Uint8Array(await blob.arrayBuffer())
}

// Every frame of a TIFF becomes a page of one PDF, so a multi-page scan opens like a multi-page PDF.
export async function loadTiffDocument(file: File): Promise<{ source: UploadedPdf; pages: PdfPage[] }> {
  const buffer = await file.arrayBuffer()
  let frames: UTIF.IFD[]
  try {
    frames = UTIF.decode(buffer)
  } catch {
    throw new Error('This TIFF could not be read. It may be damaged.')
  }

  const output = await PDFDocument.create()
  const sizes: Array<{ width: number; height: number }> = []
  for (const frame of frames) {
    // Subfile type 1 marks a reduced-size copy of another frame, which would only duplicate a page.
    const subfileType = Array.isArray(frame.t254) ? Number(frame.t254[0]) : 0
    if (subfileType & 1) continue
    try {
      UTIF.decodeImage(buffer, frame)
    } catch {
      throw new Error('This TIFF uses a compression the app cannot open.')
    }
    if (!frame.width || !frame.height) continue
    const image = await output.embedJpg(await frameToJpeg(frame))
    sizes.push(addImagePage(output, image, 'auto'))
  }
  if (sizes.length === 0) throw new Error('This TIFF does not contain any pages.')

  const id = crypto.randomUUID()
  const pdfBytes = await output.save()
  const fileBytes = new Uint8Array(pdfBytes.byteLength)
  fileBytes.set(pdfBytes)
  return {
    source: {
      id,
      name: file.name,
      file: new File([fileBytes.buffer], file.name, { type: 'application/pdf', lastModified: file.lastModified }),
      importedAt: new Date().toISOString(),
      totalPages: sizes.length,
      metadata: {
        title: file.name,
        author: '',
        subject: '',
        keywords: '',
        creationDate: '',
        modificationDate: '',
        creator: '',
        producer: '',
        version: '',
      },
      sourceType: 'image',
      sourceSize: file.size,
    },
    pages: sizes.map((size, index) => ({
      id: `${id}-${index + 1}`,
      sourcePdfId: id,
      sourcePdfName: file.name,
      pageNumber: index + 1,
      rotation: 0,
      thumbnail: '',
      width: size.width,
      height: size.height,
    })),
  }
}
