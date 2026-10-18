/** Keeps scene writes independent of the canvas lifecycle. Snapshots are immutable. */
export function createBoardSceneSaver() {
  let latest: string | null = null
  let saved: string | null = null
  let pending: Promise<void> | null = null

  return {
    capture(payload: string) {
      // Excalidraw's first hydrated change establishes its normalized baseline.
      // Merely opening a board must never rewrite the stored document.
      if (latest === null) saved = payload
      latest = payload
      return latest !== saved
    },
    isReady: () => latest !== null,
    isDirty: () => latest !== saved,
    isSaving: () => pending !== null,
    async flush(write: (payload: string) => Promise<void>) {
      while (pending) await pending
      if (latest === null) throw new Error('The board is still loading.')
      const task = (async () => {
        while (latest !== saved) {
          const payload = latest!
          await write(payload)
          saved = payload
        }
      })()
      pending = task
      try {
        await task
      } finally {
        pending = null
      }
    },
  }
}
