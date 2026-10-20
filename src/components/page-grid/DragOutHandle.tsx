import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { GripHorizontal, LoaderCircle } from 'lucide-react'
import type { PdfPage, UploadedPdf } from '../../types/pdf'
import { createMergedPdf } from '../../lib/export/merged'
import { individualFilename, mergedFilename } from '../../lib/export/filenames'

interface DragOutHandleProps {
  page: PdfPage
  pdfs: UploadedPdf[]
  /** Pages that leave with this card: the whole selection when this card is part of one. */
  getDragPages: () => PdfPage[]
}

interface PreparedFile {
  signature: string
  url: string
  filename: string
}

// Only Chromium lets a page hand a file to the desktop during a drag (the DownloadURL type).
const supportsDragOut =
  typeof navigator !== 'undefined' && 'userAgentData' in navigator

export function DragOutHandle({ page, pdfs, getDragPages }: DragOutHandleProps) {
  const [prepared, setPrepared] = useState<PreparedFile>()
  const [target, setTarget] = useState({ signature: '', count: 1 })
  const [hasFailed, setHasFailed] = useState(false)
  const preparedRef = useRef<PreparedFile>(undefined)
  const pendingSignature = useRef<string>(undefined)

  const releasePrepared = useCallback(() => {
    if (preparedRef.current) URL.revokeObjectURL(preparedRef.current.url)
    preparedRef.current = undefined
  }, [])

  useEffect(() => releasePrepared, [releasePrepared])

  // Built on hover/focus so the file already exists when the drag starts.
  const prepare = useCallback(() => {
    const pages = getDragPages()
    const signature = pages.map((item) => `${item.id}:${item.rotation}`).join('|')
    setTarget({ signature, count: pages.length })
    if (preparedRef.current?.signature === signature || pendingSignature.current === signature) return

    pendingSignature.current = signature
    setHasFailed(false)
    createMergedPdf(pages, pdfs).then(
      (bytes) => {
        if (pendingSignature.current !== signature) return
        releasePrepared()
        const next: PreparedFile = {
          signature,
          url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })),
          filename:
            pages.length === 1
              ? individualFilename(pages[0])
              : mergedFilename(`PDF Studio - ${pages.length} pages`),
        }
        preparedRef.current = next
        setPrepared(next)
      },
      () => {
        if (pendingSignature.current === signature) {
          pendingSignature.current = undefined
          setHasFailed(true)
        }
      },
    )
  }, [getDragPages, pdfs, releasePrepared])

  const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const file = preparedRef.current
    if (!file) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('DownloadURL', `application/pdf:${file.filename}:${file.url}`)
    const preview = event.currentTarget.closest('.page-preview')
    if (preview) event.dataTransfer.setDragImage(preview, 20, 20)
  }

  if (!supportsDragOut) return null

  const { count } = target
  const isReady = prepared !== undefined && prepared.signature === target.signature && !hasFailed
  const label = hasFailed
    ? 'Could not prepare this page for dragging'
    : count > 1
      ? `Drag ${count} selected pages out as one PDF`
      : `Drag page ${page.pageNumber} out as a PDF`

  return (
    <button
      type="button"
      className={`page-dragout-handle${isReady ? '' : ' is-preparing'}${hasFailed ? ' has-failed' : ''}`}
      draggable={isReady}
      aria-label={label}
      title={isReady ? `${label} to your desktop or a folder` : hasFailed ? label : 'Preparing…'}
      onPointerEnter={prepare}
      onFocus={prepare}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDragStart={handleDragStart}
    >
      {isReady || hasFailed ? <GripHorizontal size={14} /> : <LoaderCircle size={14} className="spin" />}
      {count > 1 && <span>{count}</span>}
    </button>
  )
}
