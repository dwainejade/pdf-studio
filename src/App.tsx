import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import {
  AlertCircle,
  ArrowDownToLine,
  FileStack,
  FileText,
  Info,
  LayoutGrid,
  Redo2,
  RotateCw,
  Search,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { PageGrid } from './components/page-grid/PageGrid'
import { DocumentInspector } from './components/page-grid/DocumentInspector'
import { PagePreviewViewer } from './components/page-grid/PagePreviewViewer'
import { ExportDrawer } from './components/export/ExportDrawer'
import { loadPdfPages } from './lib/pdfLoader'
import { loadWorkspace, savePdfFile, saveWorkspace } from './lib/workspaceDatabase'
import { usePdfStore } from './store/pdfStore'
import { useViewPreferences, type DetailSortKey } from './store/viewPreferences'
import type { UploadError } from './types/pdf'
import './App.css'

function App() {
  const [processingCount, setProcessingCount] = useState(0)
  const [errors, setErrors] = useState<UploadError[]>([])
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [inspectedPageId, setInspectedPageId] = useState<string | null>(null)
  const [isInspectorOpen, setIsInspectorOpen] = useState(false)
  const [viewerPageId, setViewerPageId] = useState<string | null>(null)
  const [isWorkspaceReady, setIsWorkspaceReady] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false)
  const pages = usePdfStore((state) => state.pages)
  const pdfs = usePdfStore((state) => state.pdfs)
  const selectedPageIds = usePdfStore((state) => state.selectedPageIds)
  const canUndo = usePdfStore((state) => state.past.length > 0)
  const canRedo = usePdfStore((state) => state.future.length > 0)
  const addPdf = usePdfStore((state) => state.addPdf)
  const restoreWorkspace = usePdfStore((state) => state.restoreWorkspace)
  const reorderPages = usePdfStore((state) => state.reorderPages)
  const togglePageSelection = usePdfStore((state) => state.togglePageSelection)
  const setPageSelection = usePdfStore((state) => state.setPageSelection)
  const clearSelection = usePdfStore((state) => state.clearSelection)
  const deletePages = usePdfStore((state) => state.deletePages)
  const rotatePages = usePdfStore((state) => state.rotatePages)
  const renamePage = usePdfStore((state) => state.renamePage)
  const undo = usePdfStore((state) => state.undo)
  const redo = usePdfStore((state) => state.redo)
  const viewMode = useViewPreferences((state) => state.viewMode)
  const thumbnailSize = useViewPreferences((state) => state.thumbnailSize)
  const searchQuery = useViewPreferences((state) => state.searchQuery)
  const detailSortKey = useViewPreferences((state) => state.detailSortKey)
  const setViewMode = useViewPreferences((state) => state.setViewMode)
  const setThumbnailSize = useViewPreferences((state) => state.setThumbnailSize)
  const setSearchQuery = useViewPreferences((state) => state.setSearchQuery)
  const setDetailSortKey = useViewPreferences((state) => state.setDetailSortKey)
  const selectedPageSet = useMemo(() => new Set(selectedPageIds), [selectedPageIds])
  const selectedPages = useMemo(
    () => pages.filter((page) => selectedPageSet.has(page.id)),
    [pages, selectedPageSet],
  )
  const allPagesSelected = pages.length > 0 && selectedPages.length === pages.length
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase()
  const visiblePages = useMemo(() => {
    if (!normalizedSearch) return pages
    return pages.filter((page) => {
      const metadata = pdfs.find((pdf) => pdf.id === page.sourcePdfId)?.metadata
      return [
        page.label,
        page.sourcePdfName,
        String(page.pageNumber),
        metadata?.title,
        metadata?.author,
        metadata?.subject,
        metadata?.keywords,
        metadata?.creator,
        metadata?.producer,
      ].some((value) => value?.toLocaleLowerCase().includes(normalizedSearch))
    })
  }, [normalizedSearch, pages, pdfs])
  const orderedVisiblePages = useMemo(() => {
    if (viewMode !== 'detail' || detailSortKey === 'importOrder') return visiblePages
    return [...visiblePages].sort((a, b) => {
      const pdfA = pdfs.find((pdf) => pdf.id === a.sourcePdfId)
      const pdfB = pdfs.find((pdf) => pdf.id === b.sourcePdfId)
      if (detailSortKey === 'pageNumber') return a.pageNumber - b.pageNumber
      if (detailSortKey === 'fileName') {
        return a.sourcePdfName.localeCompare(b.sourcePdfName) || a.pageNumber - b.pageNumber
      }
      const metadataKey = detailSortKey === 'title' ? 'title' : 'author'
      return (pdfA?.metadata[metadataKey] ?? '').localeCompare(pdfB?.metadata[metadataKey] ?? '') ||
        a.sourcePdfName.localeCompare(b.sourcePdfName) ||
        a.pageNumber - b.pageNumber
    })
  }, [detailSortKey, pdfs, viewMode, visiblePages])
  const inspectedPage = pages.find((page) => page.id === inspectedPageId)
  const inspectedPdf = inspectedPage
    ? pdfs.find((pdf) => pdf.id === inspectedPage.sourcePdfId)
    : undefined

  const restoreLocalWorkspace = useCallback(async () => {
    try {
      const workspace = await loadWorkspace()
      restoreWorkspace(workspace)
      setStorageError(null)
      setIsWorkspaceReady(true)
    } catch (error) {
      setStorageError(
        error instanceof Error
          ? error.message
          : 'The local workspace could not be restored.',
      )
    }
  }, [restoreWorkspace])

  useEffect(() => {
    let isCurrent = true
    void loadWorkspace().then(
      (workspace) => {
        if (!isCurrent) return
        restoreWorkspace(workspace)
        setStorageError(null)
        setIsWorkspaceReady(true)
      },
      (error: unknown) => {
        if (!isCurrent) return
        setStorageError(
          error instanceof Error
            ? error.message
            : 'The local workspace could not be restored.',
        )
      },
    )
    return () => {
      isCurrent = false
    }
  }, [restoreWorkspace])

  useEffect(() => {
    if (!isWorkspaceReady) return

    let saveTimer: number | undefined
    let saveQueue = Promise.resolve()
    const persistLatestWorkspace = () => {
      if (saveTimer !== undefined) {
        window.clearTimeout(saveTimer)
        saveTimer = undefined
      }
      const current = usePdfStore.getState()
      setIsSavingWorkspace(true)
      saveQueue = saveQueue
        .then(() => saveWorkspace(current.pdfs, current.pages, current.selectedPageIds))
        .then(() => {
          setStorageError(null)
          setIsSavingWorkspace(false)
        })
        .catch((error: unknown) => {
          setStorageError(
            error instanceof Error
              ? error.message
              : 'The local workspace could not be saved.',
          )
          setIsSavingWorkspace(false)
        })
    }
    const unsubscribe = usePdfStore.subscribe((state) => {
      if (saveTimer !== undefined) window.clearTimeout(saveTimer)
      setIsSavingWorkspace(true)
      saveTimer = window.setTimeout(() => {
        saveTimer = undefined
        saveQueue = saveQueue
          .then(() => saveWorkspace(state.pdfs, state.pages, state.selectedPageIds))
          .then(() => {
            setStorageError(null)
            setIsSavingWorkspace(false)
          })
          .catch((error: unknown) => {
            setStorageError(
              error instanceof Error
                ? error.message
                : 'The local workspace could not be saved.',
            )
            setIsSavingWorkspace(false)
          })
      }, 250)
    })
    window.addEventListener('pagehide', persistLatestWorkspace)

    return () => {
      unsubscribe()
      if (saveTimer !== undefined) window.clearTimeout(saveTimer)
      window.removeEventListener('pagehide', persistLatestWorkspace)
    }
  }, [isWorkspaceReady])

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
        const importedAt = new Date().toISOString()
        try {
          const loadedPdf = await loadPdfPages(file, id)
          const uploadedPdf = {
            id,
            name: file.name,
            file,
            importedAt,
            totalPages: loadedPdf.totalPages,
            metadata: loadedPdf.metadata,
          }
          await savePdfFile(uploadedPdf)
          addPdf(uploadedPdf, loadedPdf.pages)
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
    disabled: !isWorkspaceReady,
  })

  const hasSelection = selectedPageIds.length > 0
  const closeViewer = useCallback(() => setViewerPageId(null), [])

  return (
    <div
      {...getRootProps({
        className: `app-shell${isDragActive ? ' is-dragging' : ''}`,
        'aria-label': 'PDF Studio workspace. Drop PDFs anywhere to add them.',
      })}
    >
      <input {...getInputProps({ className: 'workspace-file-input' })} />
      <main className="canvas">
        <div className="canvas-toolbar">
          <div className="toolbar-brand">
            <span className="toolbar-brand-mark">
              <FileStack size={18} strokeWidth={1.8} />
            </span>
            <span className="toolbar-brand-name">PDF <strong>Studio</strong></span>
            <span className="toolbar-divider" aria-hidden="true" />
            <span className="toolbar-file-status">
              <span className="status-dot" />
              {pages.length > 0
                ? `${pdfs.length} ${pdfs.length === 1 ? 'PDF' : 'PDFs'} · ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`
                : 'Local workspace'}
            </span>
          </div>
          <div className="canvas-summary">
            <FileText size={15} />
            <span>
              {pages.length > 0
                ? `${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`
                : 'Workspace'}
            </span>
            {!isWorkspaceReady && !storageError && (
              <span className="canvas-processing">Restoring local workspace…</span>
            )}
            {isSavingWorkspace && (
              <span className="canvas-processing">Saving locally…</span>
            )}
            {isWorkspaceReady && !isSavingWorkspace && !storageError && pages.length > 0 && (
              <span className="workspace-saved-status">Saved on this device</span>
            )}
            {processingCount > 0 && (
              <span className="canvas-processing">Processing PDFs…</span>
            )}
            {selectedPageIds.length > 0 && (
              <span className="selection-count">{selectedPageIds.length} Selected</span>
            )}
          </div>
          <div className="workspace-actions">
            <button
              className="workspace-action-button add-files-button"
              type="button"
              disabled={!isWorkspaceReady}
              onClick={open}
            >
              <FileText size={15} />
              Add PDFs
            </button>
            <div className="toolbar-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search pages by label, source, page number, or PDF metadata"
                placeholder="Search pages and metadata"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear page search"
                  onClick={() => setSearchQuery('')}
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="view-mode-switcher" role="group" aria-label="Page view mode">
              <button
                className={`view-mode-button${viewMode === 'grid' ? ' is-active' : ''}`}
                type="button"
                aria-label="Grid view"
                aria-pressed={viewMode === 'grid'}
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid size={15} />
                <span>Grid</span>
              </button>
              <button
                className={`view-mode-button${viewMode === 'detail' ? ' is-active' : ''}`}
                type="button"
                aria-label="Detail view"
                aria-pressed={viewMode === 'detail'}
                onClick={() => setViewMode('detail')}
              >
                <FileText size={15} />
                <span>Detail</span>
              </button>
            </div>
            {viewMode === 'detail' && (
              <label className="detail-sort-control">
                Sort
                <select
                  aria-label="Sort detail view"
                  value={detailSortKey}
                  onChange={(event) => setDetailSortKey(event.target.value as DetailSortKey)}
                >
                  <option value="importOrder">Import order</option>
                  <option value="fileName">File name</option>
                  <option value="pageNumber">Page number</option>
                  <option value="title">Title</option>
                  <option value="author">Author</option>
                </select>
              </label>
            )}
            <label className="thumbnail-size-control">
              <ZoomOut size={14} aria-hidden="true" />
              <input
                type="range"
                aria-label="Thumbnail size"
                min="50"
                max="200"
                step="10"
                value={thumbnailSize}
                onChange={(event) => setThumbnailSize(Number(event.target.value))}
              />
              <ZoomIn size={14} aria-hidden="true" />
              <output>{thumbnailSize}%</output>
            </label>
            <button
              className="workspace-action-button"
              type="button"
              onClick={() => (allPagesSelected ? clearSelection() : setPageSelection(pages.map((page) => page.id)))}
              disabled={pages.length === 0}
            >
              {allPagesSelected ? 'Deselect All' : 'Select All'}
            </button>
            <button
              className={`workspace-action-icon${isInspectorOpen ? ' is-active' : ''}`}
              type="button"
              aria-label="Toggle inspector"
              aria-pressed={isInspectorOpen}
              title="Inspector"
              onClick={() => setIsInspectorOpen((open) => !open)}
            >
              <Info size={16} />
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

        {storageError && (
          <section className="storage-error" role="alert">
            <AlertCircle size={17} aria-hidden="true" />
            <div>
              <strong>Local workspace storage issue</strong>
              <span>{storageError}</span>
            </div>
            {!isWorkspaceReady && (
              <button type="button" onClick={() => void restoreLocalWorkspace()}>
                Retry restore
              </button>
            )}
          </section>
        )}

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
            pages={orderedVisiblePages}
            pdfs={pdfs}
            isProcessing={processingCount > 0}
            selectedPageIds={selectedPageIds}
            viewMode={viewMode}
            thumbnailSize={thumbnailSize}
            searchQuery={normalizedSearch}
            onToggleSelection={togglePageSelection}
            onSetSelection={setPageSelection}
            onReorder={reorderPages}
            onRename={renamePage}
            onInspectPage={setInspectedPageId}
            onViewPage={setViewerPageId}
            onRotatePage={(pageId) => rotatePages([pageId], 90)}
            onDeletePage={(pageId) => deletePages([pageId])}
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
      {isInspectorOpen && (
        <DocumentInspector
          page={inspectedPage}
          pdf={inspectedPdf}
          onClose={() => setIsInspectorOpen(false)}
        />
      )}
      {viewerPageId && (
        <PagePreviewViewer
          pages={orderedVisiblePages}
          pdfs={pdfs}
          pageId={viewerPageId}
          onNavigate={setViewerPageId}
          onClose={closeViewer}
        />
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
