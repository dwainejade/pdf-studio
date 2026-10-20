export interface UploadedPdf {
  id: string
  name: string
  file: File
  importedAt: string
  totalPages: number
  metadata: PdfMetadata
}

export interface PdfMetadata {
  title: string
  author: string
  subject: string
  keywords: string
  creationDate: string
  modificationDate: string
  creator: string
  producer: string
  version: string
}

export interface PdfPage {
  id: string
  sourcePdfId: string
  sourcePdfName: string
  pageNumber: number
  rotation: number
  thumbnail: string
  width: number
  height: number
  label?: string
}

export interface UploadError {
  id: string
  fileName: string
  message: string
}