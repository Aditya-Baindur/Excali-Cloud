'use client'

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  Excalidraw,
  convertToExcalidrawElements,
  hashElementsVersion,
} from '@excalidraw/excalidraw'

import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  BinaryFiles,
} from '@excalidraw/excalidraw/types'

import '@excalidraw/excalidraw/index.css'

import { useParams, useRouter } from 'next/navigation'
import LoadingPage from '@/components/LoadingPage'
import { useUser } from '@clerk/nextjs'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'

type SceneElement =
  | { type: 'rectangle'; x: number; y: number; width: number; height: number }
  | { type: 'text'; x: number; y: number; text: string; fontSize?: number }
  | {
      type: 'arrow' | 'line'
      x: number
      y: number
      width: number
      height: number
    }

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
  const { user, isLoaded } = useUser()
  const router = useRouter()

  const USER_ID = user?.id
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE!

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const saveTimer = useRef<NodeJS.Timeout | null>(null)
  const resetTimer = useRef<NodeJS.Timeout | null>(null)

  const lastSavedVersion = useRef<number>(0)

  const [initialData, setInitialData] =
    useState<ExcalidrawInitialDataState | null>(null)

  const [saveState, setSaveState] = useState<SaveState>('idle')

  const fallbackInitialData = useMemo<ExcalidrawInitialDataState>(() => {
    const skeleton = [
      { type: 'rectangle', x: 100, y: 100, width: 260, height: 120 },
      { type: 'text', x: 130, y: 140, text: 'Hello world', fontSize: 34 },
      { type: 'arrow', x: 160, y: 170, width: 140, height: 60 },
    ] satisfies SceneElement[]

    return {
      elements: convertToExcalidrawElements(skeleton),
      files: {} as BinaryFiles,
      appState: {
        viewBackgroundColor: '#ffffff',
        theme: 'light',
        collaborators: new Map(),
      },
    }
  }, [])

  // LOAD SCENE
  useEffect(() => {
    if (!isLoaded || !USER_ID || !boardId) return

    let cancelled = false

    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/boards/${boardId}/scene`, {
          headers: { 'x-user-id': USER_ID },
        })

        if (!res.ok) {
          if (!cancelled) setInitialData(fallbackInitialData)
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
        if (!cancelled) setInitialData(fallbackInitialData)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [boardId, USER_ID, isLoaded, API_BASE, fallbackInitialData])

  // SAVE
  const saveScene = useCallback(async () => {
    if (!apiRef.current || !boardId || !USER_ID) return

    const api = apiRef.current
    const elements = api.getSceneElements()

    const version = hashElementsVersion(elements)

    if (version === lastSavedVersion.current) return

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
    }

    if (resetTimer.current) clearTimeout(resetTimer.current)

    resetTimer.current = setTimeout(() => {
      setSaveState('idle')
    }, 900)
  }, [boardId, USER_ID, API_BASE])

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
      <div style={{ display: 'flex', gap: 8 }}>
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
            await saveScene()
            router.push('/dashboard')
          }}
        >
          Dashboard
        </button>
      </div>
    )
  }, [router, saveScene])

  if (!isLoaded || !initialData) return <LoadingPage />

  const dotColor =
    saveState === 'saving'
      ? '#f59e0b'
      : saveState === 'success'
        ? '#22c55e'
        : saveState === 'error'
          ? '#ef4444'
          : 'transparent'

  return (
    <div className="relative h-screen w-screen">
      {/* subtle save indicator */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: dotColor,
          opacity: saveState === 'idle' ? 0.15 : 1,
          transition: 'all 0.25s ease',
          pointerEvents: 'none',
          zIndex: 100,
        }}
      />

      <Excalidraw
        initialData={initialData}
        excalidrawAPI={(api) => (apiRef.current = api)}
        onChange={scheduleSave}
        renderTopRightUI={renderTopRightUI}
      />
    </div>
  )
}
