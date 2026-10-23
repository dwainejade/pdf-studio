import { PDFDocument, rgb } from 'pdf-lib'
import type { PdfPage, UploadedPdf } from '../types/pdf'

export type ImagePageOrientation = 'auto' | 'portrait' | 'landscape'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89

function imageFormat(file: File): 'png' | 'jpg' {
  const mimeType = file.type.toLocaleLowerCase()
  const extension = file.name.split('.').pop()?.toLocaleLowerCase()
  if (mimeType === 'image/png' || extension === 'png') return 'png'
  if (mimeType === 'image/jpeg' || extension === 'jpg' || extension === 'jpeg') return 'jpg'
  throw new Error('Only JPEG and PNG images can be added.')
}

export async function loadImagePage(
  file: File,
  orientation: ImagePageOrientation,
): Promise<{ source: UploadedPdf; page: PdfPage }> {
  const format = imageFormat(file)
  const imageBytes = await file.arrayBuffer()
  const output = await PDFDocument.create()
  const image =
    format === 'png'
      ? await output.embedPng(imageBytes)
      : await output.embedJpg(imageBytes)
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
