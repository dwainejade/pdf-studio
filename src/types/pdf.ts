export interface UploadedPdf {
  id: string
  name: string
  file: File
  importedAt: string
  totalPages: number
  metadata: PdfMetadata
  sourceType?: 'pdf' | 'image' | 'blank'
  sourceSize?: number
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

// Positions are fractions (0-1) of the page's unrotated frame, measured from its top-left, so text turns with the page.
export interface PageTextBox {
  id: string
  x: number
  y: number
  text: string
  /** Size in PDF points. */
  fontSize: number
  color: string
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
  groupId?: string
  textBoxes?: PageTextBox[]
}

export interface PageGroup {
  id: string
  name: string
}

export interface UploadError {
  id: string
  fileName: string
  message: string
}