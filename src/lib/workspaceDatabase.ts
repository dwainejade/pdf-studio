import type { PageGroup, PdfPage, PdfMetadata, UploadedPdf } from '../types/pdf'

const DATABASE_NAME = 'pdf-studio-workspace'
const DATABASE_VERSION = 1
const WORKSPACE_KEY = 'current'

interface StoredPdf {
  id: string
  name: string
  file: Blob
  importedAt: string
  totalPages: number
  metadata: PdfMetadata
  sourceType?: UploadedPdf['sourceType']
  sourceSize?: number
}

interface StoredWorkspace {
  id: typeof WORKSPACE_KEY
  pdfs: Array<Omit<UploadedPdf, 'file'>>
  pages: PdfPage[]
  groups?: PageGroup[]
  nextGroupNumber?: number
  selectedPageIds: string[]
}

export interface RestoredWorkspace {
  pdfs: UploadedPdf[]
  pages: PdfPage[]
  groups: PageGroup[]
  nextGroupNumber: number
  selectedPageIds: string[]
}

let databasePromise: Promise<IDBDatabase> | undefined
const pendingPdfIds = new Set<string>()

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('pdfs')) {
        database.createObjectStore('pdfs', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('workspace')) {
        database.createObjectStore('workspace', { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      databasePromise = undefined
      reject(request.error ?? new Error('Could not open the local workspace database.'))
    }
    request.onblocked = () => {
      databasePromise = undefined
      reject(new Error('The local workspace database is blocked by another open tab.'))
    }
  })

  return databasePromise
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('The local workspace transaction was aborted.'))
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('The local workspace transaction failed.'))
  })
}

export async function savePdfFile(pdf: UploadedPdf): Promise<void> {
  pendingPdfIds.add(pdf.id)
  try {
    const database = await openDatabase()
    const transaction = database.transaction('pdfs', 'readwrite')
    transaction.objectStore('pdfs').put({
      id: pdf.id,
      name: pdf.name,
      file: pdf.file,
      importedAt: pdf.importedAt,
      totalPages: pdf.totalPages,
      metadata: pdf.metadata,
      sourceType: pdf.sourceType,
      sourceSize: pdf.sourceSize,
    } satisfies StoredPdf)
    await transactionDone(transaction)
  } catch (error) {
    pendingPdfIds.delete(pdf.id)
    throw error
  }
}

export async function loadWorkspace(): Promise<RestoredWorkspace> {
  const database = await openDatabase()
  const transaction = database.transaction(['pdfs', 'workspace'], 'readonly')
  const done = transactionDone(transaction)
  const storedWorkspaceRequest = transaction.objectStore('workspace').get(WORKSPACE_KEY)
  const storedPdfsRequest = transaction.objectStore('pdfs').getAll() as IDBRequest<StoredPdf[]>
  const [storedWorkspace, storedPdfs] = await Promise.all([
    new Promise<StoredWorkspace | undefined>((resolve, reject) => {
      storedWorkspaceRequest.onsuccess = () =>
        resolve(storedWorkspaceRequest.result as StoredWorkspace | undefined)
      storedWorkspaceRequest.onerror = () =>
        reject(storedWorkspaceRequest.error ?? new Error('Could not read the saved workspace.'))
    }),
    new Promise<StoredPdf[]>((resolve, reject) => {
      storedPdfsRequest.onsuccess = () => resolve(storedPdfsRequest.result)
      storedPdfsRequest.onerror = () =>
        reject(storedPdfsRequest.error ?? new Error('Could not read saved PDF files.'))
    }),
  ])
  await done

  const retainedPdfIds = new Set(storedWorkspace?.pdfs.map((pdf) => pdf.id) ?? [])
  const orphanedPdfIds = storedPdfs
    .map((pdf) => pdf.id)
    .filter((id) => !retainedPdfIds.has(id))
  if (orphanedPdfIds.length > 0) {
    const cleanup = database.transaction('pdfs', 'readwrite')
    const cleanupDone = transactionDone(cleanup)
    const pdfStore = cleanup.objectStore('pdfs')
    orphanedPdfIds.forEach((id) => pdfStore.delete(id))
    await cleanupDone
  }

  if (!storedWorkspace) {
    return { pdfs: [], pages: [], groups: [], nextGroupNumber: 0, selectedPageIds: [] }
  }

  const fileRecords = new Map(storedPdfs.map((pdf) => [pdf.id, pdf]))
  const pdfs = storedWorkspace.pdfs.flatMap((pdf) => {
    const storedFile = fileRecords.get(pdf.id)
    if (!storedFile) return []
    return [{
      ...pdf,
      sourceType: storedFile.sourceType ?? pdf.sourceType,
      sourceSize: storedFile.sourceSize ?? pdf.sourceSize,
      file: new File([storedFile.file], storedFile.name, {
        type: storedFile.file.type || 'application/pdf',
        lastModified: Date.parse(storedFile.importedAt) || Date.now(),
      }),
    }]
  })
  const pdfIds = new Set(pdfs.map((pdf) => pdf.id))
  const pages = storedWorkspace.pages.filter((page) => pdfIds.has(page.sourcePdfId))
  const pageIds = new Set(pages.map((page) => page.id))
  const groupIds = new Set(pages.map((page) => page.groupId).filter(Boolean))
  const groups = (storedWorkspace.groups ?? []).filter((group) => groupIds.has(group.id))
  const highestGroupNumber = groups.reduce((highest, group) => {
    const match = /^Group (\d+)$/i.exec(group.name.trim())
    return match ? Math.max(highest, Number(match[1])) : highest
  }, 0)

  return {
    pdfs,
    pages,
    groups,
    nextGroupNumber: Math.max(storedWorkspace.nextGroupNumber ?? 0, highestGroupNumber),
    selectedPageIds: storedWorkspace.selectedPageIds.filter((id) => pageIds.has(id)),
  }
}

export async function saveWorkspace(
  pdfs: UploadedPdf[],
  pages: PdfPage[],
  groups: PageGroup[],
  nextGroupNumber: number,
  selectedPageIds: string[],
): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(['pdfs', 'workspace'], 'readwrite')
  const retainedPdfIds = new Set(pdfs.map((pdf) => pdf.id))

  const storedPdfs: StoredWorkspace['pdfs'] = pdfs.map(
    ({ file: _file, ...pdf }) => pdf,
  )
  transaction.objectStore('workspace').put({
    id: WORKSPACE_KEY,
    pdfs: storedPdfs,
    pages,
    groups,
    nextGroupNumber,
    selectedPageIds,
  } satisfies StoredWorkspace)
  await transactionDone(transaction)
  retainedPdfIds.forEach((id) => pendingPdfIds.delete(id))

  const cleanupTransaction = database.transaction('pdfs', 'readwrite')
  const cleanupDone = transactionDone(cleanupTransaction)
  const pdfStoreForCleanup = cleanupTransaction.objectStore('pdfs')
  const keysRequest = pdfStoreForCleanup.getAllKeys()
  keysRequest.onsuccess = () => {
    for (const key of keysRequest.result) {
      if (
        typeof key === 'string' &&
        !retainedPdfIds.has(key) &&
        !pendingPdfIds.has(key)
      ) {
        pdfStoreForCleanup.delete(key)
      }
    }
  }
  keysRequest.onerror = () => cleanupTransaction.abort()
  await cleanupDone
}
