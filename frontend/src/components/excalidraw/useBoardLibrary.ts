'use client'

import { useEffect, useMemo } from 'react'
import { useHandleLibrary } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { createLibraryAdapter } from '@/lib/excalidraw-library'

export function useBoardLibrary(
  excalidrawAPI: ExcalidrawImperativeAPI | null,
  userId: string | null | undefined
) {
  const adapter = useMemo(
    () => (userId ? createLibraryAdapter(userId) : null),
    [userId]
  )

  // Excalidraw does not handle library-install URLs automatically. Its hook
  // processes initial URLs and hash changes, validates sources, merges imports,
  // and persists both URL imports and files imported through the library menu.
  useHandleLibrary(
    adapter ? { excalidrawAPI, adapter } : { excalidrawAPI: null }
  )

  useEffect(() => {
    if (!excalidrawAPI || !userId) return
    const previousName = window.name
    const target = `excaliCloud${excalidrawAPI.id.replace(/[^a-z0-9]/gi, '')}`
    // The public library browser uses this target to return to this exact tab.
    window.name = target
    return () => {
      if (window.name === target) window.name = previousName
    }
  }, [excalidrawAPI, userId])
}
