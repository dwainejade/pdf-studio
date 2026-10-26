const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

// Files dragged out of mail clients often arrive with an empty or generic MIME type.
function withKnownType(file: File): File {
  const knownType = MIME_BY_EXTENSION[extensionOf(file.name)]
  if (!knownType || file.type === knownType) return file
  if (file.type && file.type !== 'application/octet-stream') return file
  return new File([file], file.name, { type: knownType, lastModified: file.lastModified })
}

// Webmail (Gmail, Outlook on the web) drags attachments as "mime:filename:url" text
// instead of file entries.
async function fetchDownloadUrl(data: string): Promise<File | null> {
  const first = data.indexOf(':')
  const second = data.indexOf(':', first + 1)
  if (first < 0 || second < 0) return null
  const name = data.slice(first + 1, second)
  const url = data.slice(second + 1)
  try {
    const response = await fetch(url, { credentials: 'include' })
    if (!response.ok) return null
    const blob = await response.blob()
    return withKnownType(new File([blob], name, { type: blob.type }))
  } catch {
    return null
  }
}

type DropSource = {
  type?: string
  dataTransfer?: DataTransfer | null
  target?: EventTarget | null
}

export async function getDroppedFiles(event: unknown): Promise<(File | DataTransferItem)[]> {
  if (Array.isArray(event)) {
    const handles = event as FileSystemFileHandle[]
    return Promise.all(handles.map(async (handle) => withKnownType(await handle.getFile())))
  }

  const source = event as DropSource
  const transfer = source.dataTransfer
  if (!transfer) {
    const input = source.target as HTMLInputElement | null
    return Array.from(input?.files ?? []).map(withKnownType)
  }

  const files = Array.from(transfer.files).map(withKnownType)
  if (files.length > 0) return files
  // File contents are hidden while dragging; expose the items so the overlay still shows.
  if (source.type !== 'drop') return Array.from(transfer.items).filter((item) => item.kind === 'file')

  const downloadUrl = transfer.getData('DownloadURL')
  if (!downloadUrl) return files
  const file = await fetchDownloadUrl(downloadUrl)
  return file ? [file] : files
}
