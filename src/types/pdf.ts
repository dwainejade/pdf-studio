export interface UploadedPdf {
  id: string
  name: string
  file: File
}

export interface PdfPage {
  id: string
  sourcePdfId: string
  sourcePdfName: string
  pageNumber: number
  rotation: number
  thumbnail: string
  label?: string
}

export interface UploadError {
  id: string
  fileName: string
  message: string
}