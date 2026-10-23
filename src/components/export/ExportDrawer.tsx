import { useMemo, useState } from 'react'
import { FolderOpen, Printer, X } from 'lucide-react'
import type { PageGroup, PdfPage, UploadedPdf } from '../../types/pdf'
import {
  canChooseExportDirectory,
  chooseExportDirectory,
  saveExportFile,
  type ExportDirectoryHandle,
} from '../../lib/export/filesystem'
import { mergedFilename } from '../../lib/export/filenames'
import { printPdfPages } from '../../lib/export/printing'

interface ExportDrawerProps {
  pages: PdfPage[]
  pdfs: UploadedPdf[]
  groups: PageGroup[]
  onClose: () => void
}

type ExportMode = 'merged' | 'groups' | 'individual'

export function ExportDrawer({ pages, pdfs, groups, onClose }: ExportDrawerProps) {
  const [mode, setMode] = useState<ExportMode>('merged')
  const groupName = groups.find((group) => {
    const members = pages.filter((page) => page.groupId === group.id)
    return (
      pages.length > 0 &&
      members.length === pages.length &&
      pages.every((page) => page.groupId === group.id)
    )
  })?.name
  const [filename, setFilename] = useState(groupName ?? 'Merged_Document')
  const [directory, setDirectory] = useState<ExportDirectoryHandle>()
  const [error, setError] = useState<string>()
  const [printError, setPrintError] = useState<string>()
  const [isExporting, setIsExporting] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
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
      } else if (mode === 'groups') {
        const { createGroupPdfs } = await import('../../lib/export/individual')
        const files = await createGroupPdfs(pages, pdfs, groups)
        for (const file of files) {
          await saveExportFile(file.bytes, file.filename, directory)
        }
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

  const printSelectedPages = async () => {
    setPrintError(undefined)
    setIsPrinting(true)
    try {
      await printPdfPages(pages, pdfs)
    } catch (cause) {
      setPrintError(
        cause instanceof Error
          ? cause.message
          : 'The selected pages could not be prepared for printing.',
      )
    } finally {
      setIsPrinting(false)
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
          <label className={`export-mode-option${mode === 'groups' ? ' is-active' : ''}`}>
            <input
              type="radio"
              name="export-mode"
              value="groups"
              checked={mode === 'groups'}
              onChange={() => setMode('groups')}
            />
            <span className="export-radio" />
            <span>
              <strong>Separate PDFs by Group</strong>
              <small>One PDF per group; ungrouped pages stay separate</small>
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
        {printError && <p className="export-error" role="alert">{printError}</p>}
        <div className="export-actions">
          <button
            className="export-print-button"
            type="button"
            disabled={pages.length === 0 || isPrinting}
            onClick={() => void printSelectedPages()}
          >
            <Printer size={15} />
            {isPrinting ? 'Preparing print…' : 'Print Selected Pages'}
          </button>
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
                : mode === 'groups'
                  ? 'Export Group PDFs'
                  : 'Export Individual PDFs'}
          </button>
        </div>
      </aside>
    </div>
  )
}
