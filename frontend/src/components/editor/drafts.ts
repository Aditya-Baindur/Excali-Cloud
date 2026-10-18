import type { VideoJSON } from '@videoflow/core'

type Draft = {
  video: VideoJSON
  assets: [string, Blob][]
}

// Drafts are scoped to the signed-in user and board. Media blobs are kept with
// the document so local image/audio layers also survive a browser refresh.
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('excalicloud-video-editor', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('drafts')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () =>
      reject(new Error('Close other editor tabs to enable draft storage.'))
  })
}

export function draftKey(userId: string, boardId: string, videoId?: string) {
  return JSON.stringify([userId, boardId, videoId || 'new'])
}

export async function saveDraft(
  key: string,
  video: VideoJSON,
  assets: Map<string, Blob>
) {
  const db = await database()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('drafts', 'readwrite')
      transaction
        .objectStore('drafts')
        .put({ video, assets: [...assets] } satisfies Draft, key)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}

export async function loadDraft(key: string) {
  const db = await database()
  try {
    return await new Promise<Draft | undefined>((resolve, reject) => {
      const request = db.transaction('drafts').objectStore('drafts').get(key)
      request.onsuccess = () => resolve(request.result as Draft | undefined)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

export function restoreDraft(
  draft: Draft,
  assets: Map<string, Blob>
): VideoJSON {
  const urls = new Map<string, string>()
  for (const [previousUrl, blob] of draft.assets) {
    const url = URL.createObjectURL(blob)
    urls.set(previousUrl, url)
    assets.set(url, blob)
  }
  // Replace references at any depth, including media inside layer groups.
  return JSON.parse(JSON.stringify(draft.video), (_key, value: unknown) =>
    typeof value === 'string' ? (urls.get(value) ?? value) : value
  ) as VideoJSON
}
