import type { PdfPage, UploadedPdf } from '../../types/pdf'
import { createMergedPdf } from './merged'

export async function printPdfPages(pages: PdfPage[], pdfs: UploadedPdf[]): Promise<void> {
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    throw new Error('Allow pop-ups for PDF Studio to open the PDF for printing.')
  }

  printWindow.document.title = 'Preparing PDF for printing'
  printWindow.document.body.textContent = 'Preparing the selected pages…'
  try {
    const bytes = await createMergedPdf(pages, pdfs)
    if (printWindow.closed) return

    const url = URL.createObjectURL(
      new Blob([bytes as BlobPart], { type: 'application/pdf' }),
    )
    printWindow.location.replace(url)
    const cleanupTimer = window.setInterval(() => {
      if (!printWindow.closed) return
      window.clearInterval(cleanupTimer)
      URL.revokeObjectURL(url)
    }, 1000)
  } catch (cause) {
    printWindow.close()
    throw cause instanceof Error
      ? cause
      : new Error('The selected pages could not be prepared for printing.')
  }
}
