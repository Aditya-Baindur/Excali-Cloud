'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Excalidraw, hashElementsVersion } from '@excalidraw/excalidraw'

import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  BinaryFiles,
} from '@excalidraw/excalidraw/types'

import '@excalidraw/excalidraw/index.css'

import { useParams, useRouter } from 'next/navigation'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import LoadingPageNS from '@/components/LoadingPageNoSignIn'
import { useBoardNavigation } from '@/components/workspace/BoardCommandMenu'

type RawScene = {
  elements?: unknown
  files?: unknown
  appState?: unknown
}

type SaveState = 'idle' | 'saving' | 'success' | 'error'

function normalizeScene(raw: RawScene): ExcalidrawInitialDataState {
  return {
    elements: (raw.elements ??
      []) as unknown as readonly OrderedExcalidrawElement[],
    files: (raw.files ?? {}) as BinaryFiles,
    appState: {
      viewBackgroundColor: '#ffffff',
      theme: 'light',
      collaborators: new Map(),
    },
  }
}

export default function ExcalidrawWrapper() {
  const { boardId } = useParams<{ boardId: string }>()
  const router = useRouter()
  const { registerGuard } = useBoardNavigation()

  const USER_ID = 'PUBLIC-USER'
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE!

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const saveTimer = useRef<NodeJS.Timeout | null>(null)
  const resetTimer = useRef<NodeJS.Timeout | null>(null)
  const pendingSave = useRef<Promise<boolean> | null>(null)
  const mounted = useRef(true)

  const lastSavedVersion = useRef<number>(0)

  const [initialData, setInitialData] =
    useState<ExcalidrawInitialDataState | null>(null)

  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [loadError, setLoadError] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (resetTimer.current) clearTimeout(resetTimer.current)
    }
  }, [])

  // LOAD SCENE
  useEffect(() => {
    if (!USER_ID || !boardId) return

    let cancelled = false

    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/boards/${boardId}/scene`, {
          headers: { 'x-user-id': USER_ID },
        })

        if (!res.ok) {
          if (!cancelled) setLoadError(true)
          return
        }

        const raw: RawScene = await res.json()
        const normalized = normalizeScene(raw)

        if (!cancelled) {
          setInitialData(normalized)

          const version = hashElementsVersion(normalized.elements ?? [])
          lastSavedVersion.current = version
        }
      } catch {
        if (!cancelled) setLoadError(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [boardId, USER_ID, API_BASE, retry])

  // SAVE
  const saveScene = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    while (pendingSave.current) await pendingSave.current
    if (!apiRef.current || !boardId || !USER_ID) return false

    const api = apiRef.current
    const elements = api.getSceneElements()

    const version = hashElementsVersion(elements)

    if (version === lastSavedVersion.current) return true

    const s = api.getAppState()

    const payload = {
      elements,
      files: api.getFiles(),
      appState: {
        viewBackgroundColor: s.viewBackgroundColor,
        theme: s.theme,
        zoom: s.zoom,
        scrollX: s.scrollX,
        scrollY: s.scrollY,
      },
    }

    setSaveState('saving')

    const task = (async () => {
      try {
        const res = await fetch(`${API_BASE}/boards/${boardId}/scene`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': USER_ID,
          },
          body: JSON.stringify(payload),
        })

        if (!res.ok) throw new Error()

        lastSavedVersion.current = version
        setSaveState('success')
      } catch {
        setSaveState('error')
        return false
      }

      if (resetTimer.current) clearTimeout(resetTimer.current)

      if (mounted.current) {
        resetTimer.current = setTimeout(() => {
          setSaveState((current) => (current === 'success' ? 'idle' : current))
        }, 900)
      }
      return true
    })()
    pendingSave.current = task
    try {
      return await task
    } finally {
      pendingSave.current = null
    }
  }, [boardId, USER_ID, API_BASE])

  useEffect(
    () =>
      registerGuard(async () => {
        if (apiRef.current && !(await saveScene())) {
          throw new Error('Could not save this board. Try again.')
        }
      }),
    [registerGuard, saveScene]
  )

  // AUTOSAVE
  const scheduleSave = useCallback(() => {
    if (!apiRef.current) return

    const elements = apiRef.current.getSceneElements()
    const version = hashElementsVersion(elements)

    if (version === lastSavedVersion.current) return

    if (saveTimer.current) clearTimeout(saveTimer.current)

    saveTimer.current = setTimeout(() => {
      saveScene()
    }, 1200)
  }, [saveScene])

  // CMD + S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        e.stopPropagation()
        saveScene()
      }
    }

    window.addEventListener('keydown', handler, { capture: true })

    return () => {
      window.removeEventListener('keydown', handler, { capture: true })
    }
  }, [saveScene])

  // UI BUTTONS
  const renderTopRightUI = useCallback(() => {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {saveState !== 'idle' ? (
          <span
            role="status"
            className={`rounded-md bg-black px-2 py-1 text-xs ${saveState === 'error' ? 'text-red-400' : 'text-neutral-300'}`}
          >
            {saveState === 'saving'
              ? 'Saving…'
              : saveState === 'success'
                ? 'Saved'
                : 'Save failed'}
          </span>
        ) : null}
        <button
          style={{
            padding: '6px 10px',
            background: 'black',
            color: 'white',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
          onClick={() => saveScene()}
        >
          Save
        </button>

        <button
          style={{
            padding: '6px 10px',
            background: 'black',
            color: 'white',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
          onClick={async () => {
            if (await saveScene()) router.push('/public/dashboard')
          }}
        >
          Boards
        </button>

        <button
          style={{
            padding: '6px 10px',
            background: 'black',
            color: 'white',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
          onClick={async () => {
            if (await saveScene()) router.push('/dashboard')
          }}
        >
          Sign in
        </button>
      </div>
    )
  }, [router, saveScene, saveState])

  if (loadError)
    return (
      <main className="flex min-h-dvh items-center justify-center bg-neutral-950 px-6 text-white">
        <div className="text-center">
          <p role="alert" className="text-sm text-neutral-300">
            Could not load this board.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5"
              onClick={() => router.push('/public/dashboard')}
            >
              Back to boards
            </button>
            <button
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm hover:bg-violet-500"
              onClick={() => {
                setLoadError(false)
                setRetry((current) => current + 1)
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </main>
    )

  if (!initialData) return <LoadingPageNS />

  return (
    <div className="relative h-screen w-screen">
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={(api) => (apiRef.current = api)}
        onChange={scheduleSave}
        renderTopRightUI={renderTopRightUI}
      />
    </div>
  )
}
