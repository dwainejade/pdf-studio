export interface ExportWritable {
  write(data: Uint8Array): Promise<void>
  close(): Promise<void>
}

export interface ExportFileHandle {
  createWritable(): Promise<ExportWritable>
}

export interface ExportDirectoryHandle {
  name: string
  getFileHandle(
    name: string,
    options: { create: true },
  ): Promise<ExportFileHandle>
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: () => Promise<ExportDirectoryHandle>
}

export function canChooseExportDirectory(): boolean {
  return typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function'
}

export async function chooseExportDirectory(): Promise<ExportDirectoryHandle> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker
  if (!picker) {
    throw new Error('Choosing an export folder is not supported by this browser.')
  }
  return picker.call(window)
}

export async function saveExportFile(
  bytes: Uint8Array,
  filename: string,
  directory?: ExportDirectoryHandle,
): Promise<void> {
  if (directory) {
    const fileHandle = await directory.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(bytes)
    await writable.close()
    return
  }

  const blob = new Blob([new Uint8Array(bytes).buffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
