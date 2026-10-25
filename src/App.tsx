import { useCallback, useEffect, useMemo, useState } from 'react'
import { groupWithAnimation, removeWithAnimation, ungroupWithAnimation } from './lib/pageAnimations'
import { useDropzone, type FileRejection } from 'react-dropzone'
import {
  AlertCircle,
  ArrowLeft,
  ArrowDownToLine,
  Check,
  Copy,
  FilePlus,
  FileStack,
  FileText,
  Info,
  Layers,
  LockKeyhole,
  Monitor,
  Moon,
  Pencil,
  Plus,
  Redo2,
  RotateCw,
  Search,
  Sun,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { PageGrid, RENAME_EVENT } from './components/page-grid/PageGrid'
import { DocumentInspector } from './components/page-grid/DocumentInspector'
import { PagePreviewViewer } from './components/page-grid/PagePreviewViewer'
import { ExportDrawer } from './components/export/ExportDrawer'
import { ImageImportDialog } from './components/uploader/ImageImportDialog'
import { loadPdfPages } from './lib/pdfLoader'
import { A4_HEIGHT, A4_WIDTH, createBlankPage } from './lib/blankPage'
import { extractArchive } from './lib/archiveLoader'
import { mapInOrder } from './lib/concurrency'
import { ACCEPTED_FILES, classifyFile, UNSUPPORTED_MESSAGE } from './lib/fileKinds'
import { loadTiffDocument } from './lib/tiffLoader'
import { loadImagePage, type ImagePageOrientation } from './lib/imagePdfLoader'
import { loadWorkspace, savePdfFile, saveWorkspace } from './lib/workspaceDatabase'
import { usePdfStore } from './store/pdfStore'
import { useViewPreferences } from './store/viewPreferences'
import type { UploadError } from './types/pdf'
import './App.css'

// Files opened with the installed app arrive through the browser's launch queue (Chromium PWAs only).
interface LaunchParams {
  files: Array<{ getFile: () => Promise<File> }>
}
declare global {
  interface Window {
    launchQueue?: { setConsumer: (consumer: (params: LaunchParams) => void) => void }
  }
}

function App() {
  const [processingCount, setProcessingCount] = useState(0)
  const [pendingImageFiles, setPendingImageFiles] = useState<File[]>([])
  const [imagePageOrientation, setImagePageOrientation] =
    useState<ImagePageOrientation>('auto')
  const [errors, setErrors] = useState<UploadError[]>([])
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [pendingDeletePageIds, setPendingDeletePageIds] = useState<string[]>([])
  const [inspectedPageId, setInspectedPageId] = useState<string | null>(null)
  const [isInspectorOpen, setIsInspectorOpen] = useState(false)
  const [viewerPageId, setViewerPageId] = useState<string | null>(null)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    pageIds: string[]
    groupId?: string
    x: number
    y: number
  } | null>(null)
  const [isRenamingActiveGroup, setIsRenamingActiveGroup] = useState(false)
  const [activeGroupNameDraft, setActiveGroupNameDraft] = useState('')
  const [isWorkspaceReady, setIsWorkspaceReady] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false)
  const pages = usePdfStore((state) => state.pages)
  const pdfs = usePdfStore((state) => state.pdfs)
  const selectedPageIds = usePdfStore((state) => state.selectedPageIds)
  const groups = usePdfStore((state) => state.groups)
  const activeGroup = groups.find((group) => group.id === activeGroupId)
  const activeGroupPages = useMemo(
    () => activeGroup ? pages.filter((page) => page.groupId === activeGroup.id) : [],
    [activeGroup, pages],
  )
  const canUndo = usePdfStore((state) => state.past.length > 0)
  const canRedo = usePdfStore((state) => state.future.length > 0)
  const addPdf = usePdfStore((state) => state.addPdf)
  const restoreWorkspace = usePdfStore((state) => state.restoreWorkspace)
  const reorderPages = usePdfStore((state) => state.reorderPages)
  const setPageSelection = usePdfStore((state) => state.setPageSelection)
  const clearSelection = usePdfStore((state) => state.clearSelection)
  const deletePages = usePdfStore((state) => state.deletePages)
  const duplicatePages = usePdfStore((state) => state.duplicatePages)
  const rotatePages = usePdfStore((state) => state.rotatePages)
  const renamePage = usePdfStore((state) => state.renamePage)
  const setPageTextBoxes = usePdfStore((state) => state.setPageTextBoxes)
  const groupPages = usePdfStore((state) => state.groupPages)
  const groupPagesWithAnimation = useCallback(
    (pageIds: string[]) => groupWithAnimation(pageIds, () => groupPages(pageIds)),
    [groupPages],
  )
  const renameGroup = usePdfStore((state) => state.renameGroup)
  const ungroupPagesInStore = usePdfStore((state) => state.ungroupPages)
  const ungroupPages = useCallback(
    (pageIds: string[]) => ungroupWithAnimation(pageIds, () => ungroupPagesInStore(pageIds)),
    [ungroupPagesInStore],
  )
  const undo = usePdfStore((state) => state.undo)
  const redo = usePdfStore((state) => state.redo)
  const theme = useViewPreferences((state) => state.theme)
  const setTheme = useViewPreferences((state) => state.setTheme)
  const thumbnailSize = useViewPreferences((state) => state.thumbnailSize)
  const searchQuery = useViewPreferences((state) => state.searchQuery)
  const setThumbnailSize = useViewPreferences((state) => state.setThumbnailSize)
  const setSearchQuery = useViewPreferences((state) => state.setSearchQuery)
  const selectedPageSet = useMemo(() => new Set(selectedPageIds), [selectedPageIds])
  const selectedPages = useMemo(
    () => pages.filter((page) => selectedPageSet.has(page.id)),
    [pages, selectedPageSet],
  )
  const selectionScopePages = activeGroup ? activeGroupPages : pages
  const allPagesSelected =
    selectionScopePages.length > 0 &&
    selectionScopePages.every((page) => selectedPageSet.has(page.id))
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase()
  const visiblePages = useMemo(() => {
    if (!normalizedSearch) return pages
    return pages.filter((page) => {
      const metadata = pdfs.find((pdf) => pdf.id === page.sourcePdfId)?.metadata
      const groupName = groups.find((group) => group.id === page.groupId)?.name
      return [
        groupName,
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
  }, [groups, normalizedSearch, pages, pdfs])
  const inspectedPage = pages.find((page) => page.id === inspectedPageId)
  const inspectedPdf = inspectedPage
    ? pdfs.find((pdf) => pdf.id === inspectedPage.sourcePdfId)
    : undefined
  const requestDeletePages = useCallback((pageIds: string[]) => {
    if (pageIds.length > 0) setPendingDeletePageIds([...pageIds])
  }, [])

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
        .then(() => saveWorkspace(
          current.pdfs,
          current.pages,
          current.groups,
          current.nextGroupNumber,
          current.selectedPageIds,
        ))
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
          .then(() => saveWorkspace(
            state.pdfs,
            state.pages,
            state.groups,
            state.nextGroupNumber,
            state.selectedPageIds,
          ))
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

      if (pendingDeletePageIds.length > 0) {
        if (event.key === 'Escape') {
          event.preventDefault()
          setPendingDeletePageIds([])
        }
        return
      }

      if (event.key === 'Delete' && selectedPageIds.length > 0) {
        event.preventDefault()
        requestDeletePages(selectedPageIds)
        return
      }

      if (
        event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        event.key.toLowerCase() === 'g'
      ) {
        const selected = pages.filter((page) => selectedPageIds.includes(page.id))
        const firstGroupId = selected[0]?.groupId
        const isCompleteExistingGroup =
          Boolean(firstGroupId) &&
          selected.every((page) => page.groupId === firstGroupId) &&
          selected.length === pages.filter((page) => page.groupId === firstGroupId).length
        if (selected.length >= 2 && !isCompleteExistingGroup) {
          event.preventDefault()
          groupPagesWithAnimation(selected.map((page) => page.id))
        }
        return
      }

      const commandKey = event.ctrlKey || event.metaKey
      if (!commandKey) return
      const key = event.key.toLowerCase()

      if (key === 'a') {
        event.preventDefault()
        setPageSelection(allPagesSelected ? [] : selectionScopePages.map((page) => page.id))
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
  }, [allPagesSelected, groupPagesWithAnimation, pages, pendingDeletePageIds.length, redo, requestDeletePages, selectedPageIds, selectionScopePages, setPageSelection, undo])

  const handleRejected = useCallback((rejectedFiles: FileRejection[]) => {
    setErrors((current) => [
      ...current,
      ...rejectedFiles.map((rejection) => ({
        id: crypto.randomUUID(),
        fileName: rejection.file.name,
        message: rejection.errors.some((error) => error.code === 'file-invalid-type')
          ? UNSUPPORTED_MESSAGE
          : rejection.errors.map((error) => error.message).join(' '),
      })),
    ])
  }, [])

  const addBlankPage = useCallback(
    async (afterPageId?: string) => {
      const selected = pages.filter((page) => selectedPageIds.includes(page.id))
      const reference =
        pages.find((page) => page.id === afterPageId) ??
        selected[selected.length - 1] ??
        (activeGroup ? activeGroupPages[activeGroupPages.length - 1] : undefined)
      // The blank page matches its neighbour's unrotated size, falling back to A4.
      const isSideways = reference ? Math.round(reference.rotation / 90) % 2 !== 0 : false
      const width = reference ? (isSideways ? reference.height : reference.width) : A4_WIDTH
      const height = reference ? (isSideways ? reference.width : reference.height) : A4_HEIGHT
      try {
        const { source, page } = await createBlankPage(width, height)
        await savePdfFile(source)
        addPdf(source, [activeGroup ? { ...page, groupId: activeGroup.id } : page], reference?.id)
      } catch (error) {
        setErrors((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            fileName: 'Blank page',
            message: error instanceof Error ? error.message : 'A blank page could not be added.',
          },
        ])
      }
    },
    [activeGroup, activeGroupPages, addPdf, pages, selectedPageIds],
  )

  const reportError = useCallback((fileName: string, message: string) => {
    setErrors((current) => [...current, { id: crypto.randomUUID(), fileName, message }])
  }, [])

  const handleFiles = useCallback(async (incoming: File[]) => {
    // Archives are unpacked first, so what is inside goes through the same steps as dropped files.
    const files: File[] = []
    for (const file of incoming) {
      const kind = classifyFile(file)
      if (kind === 'unsupported') {
        reportError(file.name, UNSUPPORTED_MESSAGE)
      } else if (kind === 'archive') {
        setProcessingCount((count) => count + 1)
        try {
          files.push(...(await extractArchive(file)))
        } catch (error) {
          reportError(file.name, error instanceof Error ? error.message : 'This archive could not be opened.')
        } finally {
          setProcessingCount((count) => count - 1)
        }
      } else {
        files.push(file)
      }
    }

    const imageFiles = files.filter((file) => classifyFile(file) === 'image')
    if (imageFiles.length > 0) {
      setPendingImageFiles((current) => [...current, ...imageFiles])
    }
    const documentFiles = files.filter((file) => ['pdf', 'tiff'].includes(classifyFile(file)))
    if (documentFiles.length === 0) return
    setProcessingCount((count) => count + documentFiles.length)

    // Files are opened a few at a time but added in the order they were given.
    const opened = await mapInOrder(documentFiles, 3, async (file) => {
      try {
        if (classifyFile(file) === 'tiff') {
          const { source, pages: tiffPages } = await loadTiffDocument(file)
          await savePdfFile(source)
          return { source, pages: tiffPages }
        }
        const id = crypto.randomUUID()
        const loadedPdf = await loadPdfPages(file, id)
        const source = {
          id,
          name: file.name,
          file,
          importedAt: new Date().toISOString(),
          totalPages: loadedPdf.totalPages,
          metadata: loadedPdf.metadata,
          sourceType: 'pdf' as const,
        }
        await savePdfFile(source)
        return { source, pages: loadedPdf.pages }
      } catch (error) {
        reportError(
          file.name,
          error instanceof Error ? error.message : 'This file could not be opened. Please try another file.',
        )
        return undefined
      } finally {
        setProcessingCount((count) => count - 1)
      }
    })
    for (const result of opened) {
      if (result) addPdf(result.source, result.pages)
    }
  }, [addPdf, reportError])

  const importImages = useCallback(async () => {
    const files = pendingImageFiles
    setPendingImageFiles([])
    setProcessingCount((count) => count + files.length)
    const converted = await mapInOrder(files, 4, async (file) => {
      try {
        const result = await loadImagePage(file, imagePageOrientation)
        await savePdfFile(result.source)
        return result
      } catch (error) {
        reportError(
          file.name,
          error instanceof Error ? error.message : 'This image could not be converted to a PDF page.',
        )
        return undefined
      } finally {
        setProcessingCount((count) => count - 1)
      }
    })
    for (const result of converted) {
      if (result) addPdf(result.source, [result.page])
    }
  }, [addPdf, imagePageOrientation, pendingImageFiles, reportError])

  // Pasting copied files or a screenshot adds them, unless the paste is meant for a text field or a dialog is open.
  useEffect(() => {
    if (!isWorkspaceReady) return
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return
      }
      if (document.querySelector('[aria-modal="true"]')) return
      const supported = Array.from(event.clipboardData?.files ?? []).filter(
        (file) => classifyFile(file) !== 'unsupported',
      )
      if (supported.length === 0) return
      event.preventDefault()
      // Screenshots arrive as a nameless "image.png"; a clearer name helps in the page list.
      void handleFiles(
        supported.map((file, index) =>
          /^image\.\w+$/i.test(file.name)
            ? new File([file], `Pasted image${supported.length > 1 ? ` ${index + 1}` : ''}.${file.name.split('.').pop()}`, {
                type: file.type,
                lastModified: file.lastModified,
              })
            : file,
        ),
      )
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [handleFiles, isWorkspaceReady])

  useEffect(() => {
    if (!isWorkspaceReady) return
    window.launchQueue?.setConsumer((params) => {
      void Promise.all(params.files.map((handle) => handle.getFile())).then((files) => {
        if (files.length > 0) void handleFiles(files)
      })
    })
  }, [handleFiles, isWorkspaceReady])

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
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
  }, [theme])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILES,
    // Pasting is handled by our own listener, which skips text fields and open dialogs.
    noPaste: true,
    noClick: true,
    noKeyboard: true,
    disabled: !isWorkspaceReady,
  })

  const hasSelection = selectedPageIds.length > 0
  const selectedPagesAreOneGroup =
    selectedPages.length > 0 &&
    Boolean(selectedPages[0].groupId) &&
    selectedPages.every((page) => page.groupId === selectedPages[0].groupId) &&
    selectedPages.length === pages.filter((page) => page.groupId === selectedPages[0].groupId).length
  const canGroupSelection = selectedPages.length >= 2 && !selectedPagesAreOneGroup
  const contextPages = contextMenu
    ? pages.filter((page) => contextMenu.pageIds.includes(page.id))
    : []
  const contextGroupId = contextMenu?.groupId
  const contextPagesAreOneGroup =
    contextPages.length > 0 &&
    Boolean(contextPages[0].groupId) &&
    contextPages.every((page) => page.groupId === contextPages[0].groupId) &&
    contextPages.length === pages.filter((page) => page.groupId === contextPages[0].groupId).length
  const contextIsWholeGroup =
    Boolean(contextGroupId) &&
    contextPages.length === pages.filter((page) => page.groupId === contextGroupId).length &&
    contextPages.every((page) => page.groupId === contextGroupId)
  const renameTarget = contextMenu
    ? (contextMenu.groupId && contextIsWholeGroup
        ? document.querySelector<HTMLElement>(`.group-card[data-group-id="${CSS.escape(contextMenu.groupId)}"]`)
        : null) ??
      (contextMenu.pageIds.length === 1
        ? document.querySelector<HTMLElement>(`[data-page-id="${CSS.escape(contextMenu.pageIds[0])}"]:not(.group-card)`)
        : null)
    : null
  const canGroupContext = contextPages.length >= 2 && !contextPagesAreOneGroup
  const canUngroupContext = contextPages.some((page) => page.groupId)
  const closeViewer = useCallback(() => setViewerPageId(null), [])
  const openGroup = (groupId: string) => {
    clearSelection()
    setActiveGroupId(groupId)
  }
  const leaveGroup = () => {
    clearSelection()
    setIsRenamingActiveGroup(false)
    setActiveGroupId(null)
  }
  const startRenamingActiveGroup = () => {
    if (!activeGroup) return
    setActiveGroupNameDraft(activeGroup.name)
    setIsRenamingActiveGroup(true)
  }
  const finishRenamingActiveGroup = () => {
    if (!activeGroup) return
    const name = activeGroupNameDraft.trim()
    if (name) renameGroup(activeGroup.id, name)
    setIsRenamingActiveGroup(false)
  }
  const cancelRenamingActiveGroup = () => {
    setActiveGroupNameDraft(activeGroup?.name ?? '')
    setIsRenamingActiveGroup(false)
  }
  const ungroupPageFromCanvas = (pageId: string) => {
    if (activeGroupPages.length <= 2) setActiveGroupId(null)
    ungroupPages([pageId])
  }
  const openContextMenu = (
    pageIds: string[],
    groupId: string | undefined,
    position: { x: number; y: number },
  ) => setContextMenu({ pageIds, groupId, ...position })
  const duplicateSelection = (pageIds: string[]) => {
    const duplicatedGroupId = duplicatePages(pageIds)
    if (activeGroupId && duplicatedGroupId) setActiveGroupId(duplicatedGroupId)
  }

  useEffect(() => {
    if (!contextMenu) return
    const dismissOnKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null)
    }
    const dismissOutsideMenu = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.page-context-menu')) {
        setContextMenu(null)
      }
    }
    window.addEventListener('keydown', dismissOnKeyDown)
    window.addEventListener('pointerdown', dismissOutsideMenu)
    return () => {
      window.removeEventListener('keydown', dismissOnKeyDown)
      window.removeEventListener('pointerdown', dismissOutsideMenu)
    }
  }, [contextMenu])

  return (
    <div
      {...getRootProps({
        className: `app-shell${isDragActive ? ' is-dragging' : ''}${activeGroup ? ' is-group-canvas' : ''}`,
        'aria-label': 'PDF Studio workspace. Drop PDFs or images anywhere to add them.',
      })}
    >
      <input {...getInputProps({ className: 'workspace-file-input' })} />
      <main className={`canvas${activeGroup ? ' group-canvas' : ''}`}>
        <div className="canvas-toolbar">
          <div className="toolbar-brand">
            {activeGroup ? (
              <button className="group-back-button" type="button" onClick={leaveGroup}>
                <ArrowLeft size={15} />
                <span>Back to home</span>
              </button>
            ) : (
              <>
                <span className="toolbar-brand-mark">
                  <FileStack size={18} strokeWidth={1.8} />
                </span>
                <span className="toolbar-brand-name">PDF <strong>Studio</strong></span>
                <span className="toolbar-divider" aria-hidden="true" />
                <span className="toolbar-file-status">
                  <span className="status-dot" />
                  {pages.length > 0
                    ? `${pdfs.length} ${pdfs.length === 1 ? 'source file' : 'source files'} · ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`
                    : 'Local workspace'}
                </span>
              </>
            )}
          </div>
          <div className="canvas-summary">
            <FileText size={15} />
            <span>
              {activeGroup
                ? `${activeGroupPages.length} ${activeGroupPages.length === 1 ? 'page' : 'pages'} in ${activeGroup.name}`
                : pages.length > 0
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
              <span className="canvas-processing">Processing files…</span>
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
              title="Add PDFs or images"
              onClick={open}
            >
              <Plus size={16} />
              Add files
            </button>
            <button
              className="workspace-action-icon"
              type="button"
              aria-label="Add blank page"
              title="Add blank page after the selection"
              disabled={!isWorkspaceReady}
              onClick={() => void addBlankPage()}
            >
              <FilePlus size={16} />
            </button>
            <div className="toolbar-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search pages by label, source, page number, or PDF metadata"
                placeholder="Search pages"
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
            <label className="thumbnail-size-control">
              <ZoomOut size={14} aria-hidden="true" />
              <input
                type="range"
                aria-label="Thumbnail size"
                min="50"
                max="300"
                step="10"
                value={thumbnailSize}
                onChange={(event) => setThumbnailSize(Number(event.target.value))}
              />
              <ZoomIn size={14} aria-hidden="true" />
              <output>{thumbnailSize}%</output>
            </label>
            {!activeGroup && <button
              className="workspace-action-button"
              type="button"
              title="Select all pages (Ctrl/Cmd+A)"
              onClick={() => (allPagesSelected ? clearSelection() : setPageSelection(selectionScopePages.map((page) => page.id)))}
              disabled={selectionScopePages.length === 0}
            >
              {allPagesSelected ? 'Deselect All' : 'Select All'}
            </button>}
            <button
              className="workspace-action-icon"
              type="button"
              aria-label={`Theme: ${theme}. Switch theme`}
              title={`Theme: ${theme}`}
              onClick={() => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')}
            >
              {theme === 'system' ? <Monitor size={16} /> : theme === 'light' ? <Sun size={16} /> : <Moon size={16} />}
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
            <div className="workspace-segmented" role="group" aria-label="History">
              <button className="workspace-action-icon" type="button" aria-label="Undo" title="Undo (Ctrl/Cmd+Z)" disabled={!canUndo} onClick={undo}>
                <Undo2 size={16} />
              </button>
              <button className="workspace-action-icon" type="button" aria-label="Redo" title="Redo (Ctrl/Cmd+Y)" disabled={!canRedo} onClick={redo}>
                <Redo2 size={16} />
              </button>
            </div>
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

        {!activeGroup && pages.length === 0 && processingCount === 0 ? (
          <div className="canvas-empty-hint">
            <div className="empty-state">
              <div className="empty-stack" aria-hidden="true">
                <span className="empty-sheet empty-sheet-3" />
                <span className="empty-sheet empty-sheet-2" />
                <span className="empty-sheet empty-sheet-1">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <h2>Drop PDFs or images to get started</h2>
              <p>Reorder, rotate, group, and merge pages, then export exactly what you need.</p>
              <button
                className="empty-state-button"
                type="button"
                disabled={!isWorkspaceReady}
                onClick={open}
              >
                <Plus size={17} />
                Choose files
              </button>
              <div className="empty-state-formats" aria-label="Supported formats">
                <span>PDF</span>
                <span>JPG</span>
                <span>PNG</span>
              </div>
              <div className="empty-state-privacy">
                <LockKeyhole size={13} aria-hidden="true" />
                Files stay on this device
              </div>
            </div>
          </div>
        ) : (
          <>
            {activeGroup && (
              <section className="group-canvas-heading" aria-label={`${activeGroup.name} group canvas`}>
                {isRenamingActiveGroup ? (
                  <form
                    className="group-canvas-rename"
                    onSubmit={(event) => {
                      event.preventDefault()
                      finishRenamingActiveGroup()
                    }}
                  >
                    <input
                      autoFocus
                      aria-label="Group name"
                      value={activeGroupNameDraft}
                      onChange={(event) => setActiveGroupNameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          cancelRenamingActiveGroup()
                        }
                      }}
                    />
                    <button type="submit" aria-label="Save group name" title="Save group name">
                      <Check size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label="Cancel group rename"
                      title="Cancel"
                      onClick={cancelRenamingActiveGroup}
                    >
                      <X size={15} />
                    </button>
                  </form>
                ) : (
                  <div className="group-canvas-title">
                    <h1 title="Double-click to rename" onDoubleClick={startRenamingActiveGroup}>
                      {activeGroup.name}
                    </h1>
                    <button
                      type="button"
                      aria-label={`Rename ${activeGroup.name}`}
                      title="Rename group"
                      onClick={startRenamingActiveGroup}
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                )}
                <span>{activeGroupPages.length} pages</span>
              </section>
            )}
            <PageGrid
              pages={activeGroup ? activeGroupPages : visiblePages}
              allPages={pages}
              groups={groups}
              pdfs={pdfs}
              isProcessing={processingCount > 0}
              selectedPageIds={selectedPageIds}
              thumbnailSize={thumbnailSize}
              searchQuery={normalizedSearch}
              onSetSelection={setPageSelection}
              onReorder={reorderPages}
              onRename={renamePage}
              onRenameGroup={renameGroup}
              onInspectPage={setInspectedPageId}
              onViewPage={setViewerPageId}
              onOpenGroup={openGroup}
              onOpenContextMenu={openContextMenu}
              expandedGroupId={activeGroup?.id}
              groupCanvasName={activeGroup?.name}
              onUngroupPage={activeGroup ? ungroupPageFromCanvas : undefined}
              animateArrivals={isWorkspaceReady}
            />
          </>
        )}
      </main>

      {hasSelection && (
        <div className="page-action-toolbar" aria-label="Page actions">
          {canGroupSelection && (
            <button
              type="button"
              className="page-action-button"
              title="Group selected pages (Shift+G)"
              onClick={() => groupPagesWithAnimation(selectedPageIds)}
            >
              <FileStack size={16} />
              <span>Group</span>
            </button>
          )}
          {selectedPages.some((page) => page.groupId) && (
            <button
              type="button"
              className="page-action-button"
              onClick={() => ungroupPages(selectedPageIds)}
            >
              <Layers size={16} />
              <span>Ungroup</span>
            </button>
          )}
          <button
            type="button"
            className="page-action-button"
            onClick={() => duplicateSelection(selectedPageIds)}
          >
            <Copy size={16} />
            <span>Duplicate</span>
          </button>
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
            onClick={() => requestDeletePages(selectedPageIds)}
          >
            <Trash2 size={16} />
            <span>Delete</span>
          </button>
        </div>
      )}
      {contextMenu && (
        <div
          className="page-context-menu"
          role="menu"
          aria-label="Page actions"
          style={{
            left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 228)),
            top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 300)),
          }}
        >
          {contextMenu.groupId && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                if (contextMenu.groupId) openGroup(contextMenu.groupId)
                setContextMenu(null)
              }}
            >
              <Layers size={15} />
              Open group
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              duplicateSelection(contextMenu.pageIds)
              setContextMenu(null)
            }}
          >
            <Copy size={15} />
            Duplicate {contextIsWholeGroup ? 'group' : contextMenu.pageIds.length === 1 ? 'page' : 'pages'}
          </button>
          {canGroupContext && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                groupPagesWithAnimation(contextMenu.pageIds)
                setContextMenu(null)
              }}
            >
              <FileStack size={15} />
              Group
            </button>
          )}
          {canUngroupContext && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                ungroupPages(contextMenu.pageIds)
                setContextMenu(null)
              }}
            >
              <Layers size={15} />
              Ungroup
            </button>
          )}
          {renameTarget && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setContextMenu(null)
                // Wait for the menu to unmount so the input keeps focus.
                window.requestAnimationFrame(() => renameTarget.dispatchEvent(new Event(RENAME_EVENT)))
              }}
            >
              <Pencil size={15} />
              Rename
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const lastId = contextMenu.pageIds[contextMenu.pageIds.length - 1]
              setContextMenu(null)
              void addBlankPage(lastId)
            }}
          >
            <FilePlus size={15} />
            Insert blank page after
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setViewerPageId(contextMenu.pageIds[0])
              setContextMenu(null)
            }}
          >
            <ZoomIn size={15} />
            Preview
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              rotatePages(contextMenu.pageIds, 90)
              setContextMenu(null)
            }}
          >
            <RotateCw size={15} />
            Rotate 90°
          </button>
          <button
            type="button"
            role="menuitem"
            className="destructive"
            onClick={() => {
              requestDeletePages(contextMenu.pageIds)
              setContextMenu(null)
            }}
          >
            <Trash2 size={15} />
            Delete
          </button>
        </div>
      )}
      {isInspectorOpen && (
        <DocumentInspector
          page={inspectedPage}
          pdf={inspectedPdf}
          onSetImageOrientation={(pageId, orientation) => {
            const page = pages.find((item) => item.id === pageId)
            if (page && (page.width > page.height) !== (orientation === 'landscape')) {
              rotatePages([pageId], 90)
            }
          }}
          onClose={() => setIsInspectorOpen(false)}
        />
      )}
      {viewerPageId && (
        <PagePreviewViewer
          pages={visiblePages}
          pdfs={pdfs}
          pageId={viewerPageId}
          onNavigate={setViewerPageId}
          onRotate={(pageId, delta) => rotatePages([pageId], delta)}
          onRename={renamePage}
          onDelete={(pageId) => requestDeletePages([pageId])}
          onUpdateText={setPageTextBoxes}
          onClose={closeViewer}
        />
      )}

      {isDragActive && (
        <div className="drop-overlay" aria-live="polite">
          <div className="drop-overlay-card">
            <FileText size={30} />
            <strong>Drop PDFs or images to add pages</strong>
            <span>Files are processed privately on this device</span>
          </div>
        </div>
      )}
      {pendingImageFiles.length > 0 && (
        <ImageImportDialog
          files={pendingImageFiles}
          orientation={imagePageOrientation}
          onOrientationChange={setImagePageOrientation}
          onImport={() => void importImages()}
          onCancel={() => setPendingImageFiles([])}
        />
      )}
      {isExportOpen && (
        <ExportDrawer
          pages={selectedPages}
          pdfs={pdfs}
          groups={groups}
          onClose={() => setIsExportOpen(false)}
        />
      )}
      {pendingDeletePageIds.length > 0 && (
        <div
          className="delete-confirmation-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setPendingDeletePageIds([])
          }}
        >
          <section
            className="delete-confirmation"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-confirmation-title"
            aria-describedby="delete-confirmation-message"
          >
            <div className="delete-confirmation-icon">
              <Trash2 size={18} aria-hidden="true" />
            </div>
            <div className="delete-confirmation-copy">
              <h2 id="delete-confirmation-title">
                Delete {pendingDeletePageIds.length === 1 ? 'page' : 'pages'}?
              </h2>
              <p id="delete-confirmation-message">
                {pendingDeletePageIds.length === 1
                  ? 'This page will be removed from your workspace.'
                  : `These ${pendingDeletePageIds.length} pages will be removed from your workspace.`}
              </p>
            </div>
            <div className="delete-confirmation-actions">
              <button
                type="button"
                className="delete-confirmation-cancel"
                autoFocus
                onClick={() => setPendingDeletePageIds([])}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-confirmation-submit"
                onClick={() => {
                  removeWithAnimation(pendingDeletePageIds, () => deletePages(pendingDeletePageIds))
                  setPendingDeletePageIds([])
                }}
              >
                Delete
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
