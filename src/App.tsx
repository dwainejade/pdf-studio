import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { AlertCircle, ArrowDownToLine, FileText, Redo2, RotateCw, Trash2, Undo2, X } from 'lucide-react'
import { Header } from './components/layout/Header'
import { PageGrid } from './components/page-grid/PageGrid'
import { ExportDrawer } from './components/export/ExportDrawer'
import { loadPdfPages } from './lib/pdfLoader'
import { usePdfStore } from './store/pdfStore'
import type { UploadError } from './types/pdf'
import './App.css'

function App() {
  const [processingCount, setProcessingCount] = useState(0)
  const [errors, setErrors] = useState<UploadError[]>([])
  const [isExportOpen, setIsExportOpen] = useState(false)
  const pages = usePdfStore((state) => state.pages)
  const pdfs = usePdfStore((state) => state.pdfs)
  const selectedPageIds = usePdfStore((state) => state.selectedPageIds)
  const canUndo = usePdfStore((state) => state.past.length > 0)
  const canRedo = usePdfStore((state) => state.future.length > 0)
  const addPdf = usePdfStore((state) => state.addPdf)
  const reorderPages = usePdfStore((state) => state.reorderPages)
  const togglePageSelection = usePdfStore((state) => state.togglePageSelection)
  const setPageSelection = usePdfStore((state) => state.setPageSelection)
  const clearSelection = usePdfStore((state) => state.clearSelection)
  const deletePages = usePdfStore((state) => state.deletePages)
  const rotatePages = usePdfStore((state) => state.rotatePages)
  const renamePage = usePdfStore((state) => state.renamePage)
  const undo = usePdfStore((state) => state.undo)
  const redo = usePdfStore((state) => state.redo)
  const selectedPageSet = useMemo(() => new Set(selectedPageIds), [selectedPageIds])
  const selectedPages = useMemo(
    () => pages.filter((page) => selectedPageSet.has(page.id)),
    [pages, selectedPageSet],
  )
  const allPagesSelected = pages.length > 0 && selectedPages.length === pages.length

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return
      }

      const commandKey = event.ctrlKey || event.metaKey
      if (!commandKey) return
      const key = event.key.toLowerCase()

      if (key === 'a') {
        event.preventDefault()
        setPageSelection(allPagesSelected ? [] : pages.map((page) => page.id))
      } else if (key === 'z' && event.shiftKey) {
        event.preventDefault()
        redo()
      } else if (key === 'z') {
        event.preventDefault()
        undo()
      } else if (key === 'y') {
        event.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [allPagesSelected, pages, redo, setPageSelection, undo])

  const handleRejected = useCallback((rejectedFiles: FileRejection[]) => {
    setErrors((current) => [
      ...current,
      ...rejectedFiles.map((rejection) => ({
        id: crypto.randomUUID(),
        fileName: rejection.file.name,
        message: rejection.errors.some((error) => error.code === 'file-invalid-type')
          ? 'Only PDF files are supported. Choose a file ending in .pdf.'
          : rejection.errors.map((error) => error.message).join(' '),
      })),
    ])
  }, [])

  const handleFiles = useCallback(async (files: File[]) => {
    setProcessingCount((count) => count + files.length)

    await Promise.all(
      files.map(async (file) => {
        const id = crypto.randomUUID()
        try {
          const loadedPages = await loadPdfPages(file, id)
          addPdf({ id, name: file.name, file }, loadedPages)
        } catch (error) {
          setErrors((current) => [
            ...current,
            {
              id,
              fileName: file.name,
              message:
                error instanceof Error
                  ? error.message
                  : 'This PDF could not be opened. Please try another file.',
            },
          ])
        } finally {
          setProcessingCount((count) => count - 1)
        }
      }),
    )
  }, [addPdf])

  const dismissError = (id: string) => {
    setErrors((current) => current.filter((error) => error.id !== id))
  }

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (acceptedFiles.length > 0) void handleFiles(acceptedFiles)
      if (rejectedFiles.length > 0) handleRejected(rejectedFiles)
    },
    [handleFiles, handleRejected],
  )
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    noClick: true,
    noKeyboard: true,
  })

  const hasSelection = selectedPageIds.length > 0

  return (
    <div
      {...getRootProps({
        className: `app-shell${isDragActive ? ' is-dragging' : ''}`,
        'aria-label': 'PDF Studio workspace. Drop PDFs anywhere to add them.',
      })}
    >
      <input {...getInputProps({ className: 'workspace-file-input' })} />
      <Header
        pageCount={pages.length}
        pdfCount={pdfs.length}
        onAddFiles={open}
      />
      <main className="canvas">
        <div className="canvas-toolbar">
          <div className="canvas-summary">
            <FileText size={15} />
            <span>
              {pages.length > 0
                ? `${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`
                : 'Workspace'}
            </span>
            {processingCount > 0 && (
              <span className="canvas-processing">Processing PDFs…</span>
            )}
            {selectedPageIds.length > 0 && (
              <span className="selection-count">{selectedPageIds.length} Selected</span>
            )}
          </div>
          <div className="workspace-actions">
            <button
              className="workspace-action-button"
              type="button"
              onClick={() => (allPagesSelected ? clearSelection() : setPageSelection(pages.map((page) => page.id)))}
              disabled={pages.length === 0}
            >
              {allPagesSelected ? 'Deselect All' : 'Select All'}
            </button>
            <button className="workspace-action-icon" type="button" aria-label="Undo" title="Undo (Ctrl/Cmd+Z)" disabled={!canUndo} onClick={undo}>
              <Undo2 size={16} />
            </button>
            <button className="workspace-action-icon" type="button" aria-label="Redo" title="Redo (Ctrl/Cmd+Y)" disabled={!canRedo} onClick={redo}>
              <Redo2 size={16} />
            </button>
            <button
              className="workspace-action-button export-open-button"
              type="button"
              disabled={!hasSelection}
              onClick={() => setIsExportOpen(true)}
            >
              <ArrowDownToLine size={15} />
              Export
            </button>
          </div>
        </div>

        {errors.length > 0 && (
          <section className="error-list" aria-label="Upload errors" aria-live="polite">
            {errors.map((error) => (
              <div className="error-item" key={error.id}>
                <AlertCircle size={18} aria-hidden="true" />
                <div className="error-copy">
                  <strong>{error.fileName}</strong>
                  <span>{error.message}</span>
                </div>
                <button
                  className="error-dismiss"
                  type="button"
                  aria-label={`Dismiss error for ${error.fileName}`}
                  onClick={() => dismissError(error.id)}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </section>
        )}

        {pages.length === 0 && processingCount === 0 ? (
          <div className="canvas-empty-hint">
            <span>Drop PDFs anywhere to get started</span>
          </div>
        ) : (
          <PageGrid
            pages={pages}
            isProcessing={processingCount > 0}
            selectedPageIds={selectedPageIds}
            onToggleSelection={togglePageSelection}
            onSetSelection={setPageSelection}
            onReorder={reorderPages}
            onRename={renamePage}
          />
        )}
      </main>

      {hasSelection && (
        <div className="page-action-toolbar" aria-label="Page actions">
          <button
            type="button"
            className="page-action-button"
            onClick={() => rotatePages(selectedPageIds, 90)}
          >
            <RotateCw size={16} />
            <span>Rotate 90°</span>
          </button>
          <button
            type="button"
            className="page-action-button destructive"
            onClick={() => {
              deletePages(selectedPageIds)
              clearSelection()
            }}
          >
            <Trash2 size={16} />
            <span>Delete</span>
          </button>
        </div>
      )}

      {isDragActive && (
        <div className="drop-overlay" aria-live="polite">
          <div className="drop-overlay-card">
            <FileText size={30} />
            <strong>Drop PDFs to add pages</strong>
            <span>Files are processed privately on this device</span>
          </div>
        </div>
      )}
      {isExportOpen && (
        <ExportDrawer
          pages={selectedPages}
          pdfs={pdfs}
          onClose={() => setIsExportOpen(false)}
        />
      )}
    </div>
  )
}

export default App
