import type {
  LibraryPersistedData,
  LibraryPersistenceAdapter,
} from '@excalidraw/excalidraw/data/library'

async function openLibraryDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('excalicloud-libraries', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('libraries')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () =>
      reject(new Error('Close other board tabs to enable library storage.'))
  })
}

/** A user's imported shapes are available on all their boards in this browser. */
export function createLibraryAdapter(
  userId: string
): LibraryPersistenceAdapter {
  return {
    async load() {
      const db = await openLibraryDatabase()
      try {
        return await new Promise<LibraryPersistedData | null>(
          (resolve, reject) => {
            const request = db
              .transaction('libraries')
              .objectStore('libraries')
              .get(userId)
            request.onsuccess = () => resolve(request.result ?? null)
            request.onerror = () => reject(request.error)
          }
        )
      } finally {
        db.close()
      }
    },
    async save(data) {
      const db = await openLibraryDatabase()
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction('libraries', 'readwrite')
          transaction.objectStore('libraries').put(data, userId)
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => reject(transaction.error)
          transaction.onabort = () => reject(transaction.error)
        })
      } finally {
        db.close()
      }
    },
  }
}
