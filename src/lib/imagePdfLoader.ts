import { PDFDocument, rgb, type PDFImage } from 'pdf-lib'
import type { PdfPage, UploadedPdf } from '../types/pdf'

export type ImagePageOrientation = 'auto' | 'portrait' | 'landscape'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89

// Longest side, in pixels, of images the browser has to decode (WebP, GIF, BMP, AVIF, SVG).
const MAX_DECODED_SIDE = 4096

function imageFormat(file: File): 'png' | 'jpg' | 'other' {
  const mimeType = file.type.toLocaleLowerCase()
  const extension = file.name.split('.').pop()?.toLocaleLowerCase()
  if (mimeType === 'image/png' || extension === 'png') return 'png'
  if (mimeType === 'image/jpeg' || extension === 'jpg' || extension === 'jpeg') return 'jpg'
  return 'other'
}

function loadHtmlImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('This image could not be read. It may be damaged.'))
    }
    image.src = url
  })
}

// Formats pdf-lib cannot embed are drawn by the browser and handed over as PNG, which keeps transparency.
async function rasterizeToPng(file: File): Promise<Uint8Array> {
  const isSvg = /svg/i.test(file.type) || /\.svg$/i.test(file.name)
  let source: CanvasImageSource
  let width: number
  let height: number
  if (isSvg) {
    // createImageBitmap cannot read SVG, and an SVG without a size needs a default.
    const image = await loadHtmlImage(file)
    width = image.naturalWidth || 1024
    height = image.naturalHeight || 1024
    source = image
  } else {
    try {
      const bitmap = await createImageBitmap(file)
      width = bitmap.width
      height = bitmap.height
      source = bitmap
    } catch {
      throw new Error(`This browser cannot read ${file.name.split('.').pop()?.toUpperCase() ?? 'this'} images.`)
    }
  }
  const scale = Math.min(1, MAX_DECODED_SIDE / Math.max(width, height))
  // A small SVG would look soft when drawn at its own size, so vector images are scaled up.
  const drawScale = isSvg ? Math.max(scale, Math.min(2000 / Math.max(width, height), MAX_DECODED_SIDE / Math.max(width, height))) : scale
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * drawScale))
  canvas.height = Math.max(1, Math.round(height * drawScale))
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height)
  if ('close' in source) source.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('This image could not be converted.')
  return new Uint8Array(await blob.arrayBuffer())
}

// Adds a page and draws the image centred and scaled to fit, without cropping.
export function addImagePage(
  output: PDFDocument,
  image: PDFImage,
  orientation: ImagePageOrientation,
): { width: number; height: number } {
  const isLandscape =
    orientation === 'auto'
      ? image.width > image.height
      : orientation === 'landscape'
  const width = isLandscape ? PAGE_HEIGHT : PAGE_WIDTH
  const height = isLandscape ? PAGE_WIDTH : PAGE_HEIGHT
  const page = output.addPage([width, height])
  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: rgb(1, 1, 1),
  })
  const scale = Math.min(width / image.width, height / image.height)
  const imageWidth = image.width * scale
  const imageHeight = image.height * scale
  page.drawImage(image, {
    x: (width - imageWidth) / 2,
    y: (height - imageHeight) / 2,
    width: imageWidth,
    height: imageHeight,
  })
  return { width, height }
}

export async function loadImagePage(
  file: File,
  orientation: ImagePageOrientation,
): Promise<{ source: UploadedPdf; page: PdfPage }> {
  const format = imageFormat(file)
  const output = await PDFDocument.create()
  const image =
    format === 'jpg'
      ? await output.embedJpg(await file.arrayBuffer())
      : await output.embedPng(format === 'png' ? await file.arrayBuffer() : await rasterizeToPng(file))
  const { width, height } = addImagePage(output, image, orientation)

  const id = crypto.randomUUID()
  const importedAt = new Date().toISOString()
  const pdfBytes = await output.save()
  const pdfFileBytes = new Uint8Array(pdfBytes.byteLength)
  pdfFileBytes.set(pdfBytes)
  const pdfFile = new File([pdfFileBytes.buffer], file.name, {
    type: 'application/pdf',
    lastModified: file.lastModified,
  })
  const metadata = {
    title: file.name,
    author: '',
    subject: '',
    keywords: '',
    creationDate: '',
    modificationDate: '',
    creator: '',
    producer: '',
    version: '',
  }
  return {
    source: {
      id,
      name: file.name,
      file: pdfFile,
      importedAt,
      totalPages: 1,
      metadata,
      sourceType: 'image',
      sourceSize: file.size,
    },
    page: {
      id: `${id}-1`,
      sourcePdfId: id,
      sourcePdfName: file.name,
      pageNumber: 1,
      rotation: 0,
      thumbnail: '',
      width,
      height,
    },
  }
}
