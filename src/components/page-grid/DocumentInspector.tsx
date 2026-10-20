import { X } from 'lucide-react'
import type { PdfPage, UploadedPdf } from '../../types/pdf'

interface DocumentInspectorProps {
  page: PdfPage
  pdf: UploadedPdf
  onClose: () => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="inspector-metadata-row">
      <dt>{label}</dt>
      <dd>{value || 'Not Available'}</dd>
    </div>
  )
}

export function DocumentInspector({ page, pdf, onClose }: DocumentInspectorProps) {
  return (
    <aside className="document-inspector" aria-label="Selected page and document information">
      <header className="inspector-header">
        <div>
          <span className="inspector-eyebrow">INSPECTOR</span>
          <h2>Page {page.pageNumber}</h2>
        </div>
        <button type="button" aria-label="Close metadata panel" onClick={onClose}>
          <X size={17} />
        </button>
      </header>

      <section className="inspector-section">
        <h3>Document information</h3>
        <dl>
          <MetadataRow label="Source file" value={pdf.name} />
          <MetadataRow label="File size" value={formatFileSize(pdf.file.size)} />
          <MetadataRow label="Total pages" value={String(pdf.totalPages)} />
          <MetadataRow
            label="Imported"
            value={new Date(pdf.importedAt).toLocaleString()}
          />
        </dl>
      </section>

      <section className="inspector-section">
        <h3>PDF metadata</h3>
        <dl>
          <MetadataRow label="Title" value={pdf.metadata.title} />
          <MetadataRow label="Author" value={pdf.metadata.author} />
          <MetadataRow label="Subject" value={pdf.metadata.subject} />
          <MetadataRow label="Keywords" value={pdf.metadata.keywords} />
          <MetadataRow label="Created" value={pdf.metadata.creationDate} />
          <MetadataRow label="Modified" value={pdf.metadata.modificationDate} />
          <MetadataRow label="Creator" value={pdf.metadata.creator} />
          <MetadataRow label="Producer" value={pdf.metadata.producer} />
          <MetadataRow label="PDF version" value={pdf.metadata.version} />
        </dl>
      </section>

      <section className="inspector-section">
        <h3>Page details</h3>
        <dl>
          <MetadataRow label="Page number" value={String(page.pageNumber)} />
          <MetadataRow label="Label" value={page.label ?? ''} />
          <MetadataRow label="Rotation" value={`${page.rotation}°`} />
          <MetadataRow label="Dimensions" value={`${page.width.toFixed(1)} × ${page.height.toFixed(1)} pt`} />
          <MetadataRow label="Width" value={`${page.width.toFixed(1)} pt`} />
          <MetadataRow label="Height" value={`${page.height.toFixed(1)} pt`} />
        </dl>
      </section>
    </aside>
  )
}
