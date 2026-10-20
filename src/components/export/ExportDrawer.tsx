import { useMemo, useState } from 'react'
import { FolderOpen, X } from 'lucide-react'
import type { PdfPage, UploadedPdf } from '../../types/pdf'
import {
  canChooseExportDirectory,
  chooseExportDirectory,
  saveExportFile,
  type ExportDirectoryHandle,
} from '../../lib/export/filesystem'
import { mergedFilename } from '../../lib/export/filenames'

interface ExportDrawerProps {
  pages: PdfPage[]
  pdfs: UploadedPdf[]
  onClose: () => void
}

type ExportMode = 'merged' | 'individual'

export function ExportDrawer({ pages, pdfs, onClose }: ExportDrawerProps) {
  const [mode, setMode] = useState<ExportMode>('merged')
  const [filename, setFilename] = useState('Merged_Document')
  const [directory, setDirectory] = useState<ExportDirectoryHandle>()
  const [error, setError] = useState<string>()
  const [isExporting, setIsExporting] = useState(false)
  const selectedPages = useMemo(() => new Set(pages.map((page) => page.id)), [pages])
  const canPickFolder = canChooseExportDirectory()

  const selectFolder = async () => {
    setError(undefined)
    try {
      setDirectory(await chooseExportDirectory())
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setError(cause instanceof Error ? cause.message : 'Could not choose an export folder.')
    }
  }

  const exportFiles = async () => {
    setError(undefined)
    setIsExporting(true)
    try {
      if (mode === 'merged') {
        const { createMergedPdf } = await import('../../lib/export/merged')
        const bytes = await createMergedPdf(pages, pdfs)
        await saveExportFile(bytes, mergedFilename(filename), directory)
      } else {
        const { createIndividualPdfs } = await import('../../lib/export/individual')
        const files = await createIndividualPdfs(pages, pdfs)
        for (const file of files) {
          await saveExportFile(file.bytes, file.filename, directory)
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The selected pages could not be exported.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="export-drawer-backdrop" onMouseDown={onClose}>
      <aside
        className="export-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="export-drawer-header">
          <div>
            <span className="export-eyebrow">LOCAL EXPORT</span>
            <h2 id="export-title">Export</h2>
          </div>
          <button className="export-close-button" type="button" aria-label="Close export panel" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="export-selected-count">
          <span>Pages Selected</span>
          <strong>{selectedPages.size}</strong>
        </div>

        <fieldset className="export-mode-options">
          <legend>Export format</legend>
          <label className={`export-mode-option${mode === 'merged' ? ' is-active' : ''}`}>
            <input
              type="radio"
              name="export-mode"
              value="merged"
              checked={mode === 'merged'}
              onChange={() => setMode('merged')}
            />
            <span className="export-radio" />
            <span>
              <strong>Merge into One PDF</strong>
              <small>Keep the current page order</small>
            </span>
          </label>
          <label className={`export-mode-option${mode === 'individual' ? ' is-active' : ''}`}>
            <input
              type="radio"
              name="export-mode"
              value="individual"
              checked={mode === 'individual'}
              onChange={() => setMode('individual')}
            />
            <span className="export-radio" />
            <span>
              <strong>Individual PDFs</strong>
              <small>One selected page per file</small>
            </span>
          </label>
        </fieldset>

        {mode === 'merged' && (
          <label className="export-filename">
            <span>Filename</span>
            <div className="export-filename-input">
              <input
                value={filename}
                onChange={(event) => setFilename(event.target.value)}
                aria-label="Merged PDF filename"
                placeholder="Merged_Document"
              />
              <span>.pdf</span>
            </div>
          </label>
        )}

        <div className="export-destination">
          <div>
            <strong>Save destination</strong>
            <span>{directory ? directory.name : 'Downloads folder'}</span>
          </div>
          {canPickFolder && (
            <button className="export-folder-button" type="button" onClick={() => void selectFolder()}>
              <FolderOpen size={15} />
              {directory ? 'Change Folder' : 'Choose Folder'}
            </button>
          )}
        </div>

        {error && <p className="export-error" role="alert">{error}</p>}
        <button
          className="export-submit-button"
          type="button"
          disabled={pages.length === 0 || isExporting || (mode === 'merged' && !filename.trim())}
          onClick={() => void exportFiles()}
        >
          {isExporting
            ? 'Preparing export…'
            : mode === 'merged'
              ? 'Export Merged PDF'
              : 'Export Individual PDFs'}
        </button>
      </aside>
    </div>
  )
}
