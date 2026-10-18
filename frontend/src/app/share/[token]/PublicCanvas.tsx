'use client'

import { useCallback, useMemo, useRef } from 'react'
import { Excalidraw, MainMenu } from '@excalidraw/excalidraw'
import { Eye } from 'lucide-react'
import type {
  BinaryFiles,
  ExcalidrawInitialDataState,
  ExcalidrawProps,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import CanvasVideo, { UnavailableVideo } from '@/components/videos/CanvasVideo'
import {
  getCanvasVideo,
  isCanvasVideoLink,
  validateCanvasVideoLink,
} from '@/lib/canvas-video'
import type { Video } from '@/lib/types'
import '@excalidraw/excalidraw/index.css'

export type SharedScene = {
  elements?: unknown
  appState?: Record<string, unknown>
  files?: unknown
}

export default function PublicCanvas({
  scene,
  name,
  boardId,
  token,
  videos,
}: {
  scene: SharedScene
  name: string
  boardId: string
  token: string
  videos: Video[]
}) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const fittedRef = useRef(false)
  const videosById = useMemo(
    () =>
      new Map(
        videos
          .filter((video) => video.boardId === boardId)
          .map((video) => [video.id, video])
      ),
    [videos, boardId]
  )
  const initialData = useMemo<ExcalidrawInitialDataState>(
    () => ({
      elements: (Array.isArray(scene.elements)
        ? scene.elements
        : []) as readonly OrderedExcalidrawElement[],
      files: (scene.files ?? {}) as BinaryFiles,
      appState: {
        viewBackgroundColor:
          typeof scene.appState?.viewBackgroundColor === 'string'
            ? scene.appState.viewBackgroundColor
            : '#ffffff',
        collaborators: new Map(),
      },
      scrollToContent: true,
    }),
    [scene]
  )

  const renderEmbeddable = useCallback<
    NonNullable<ExcalidrawProps['renderEmbeddable']>
  >(
    (element, appState) => {
      const embeddedVideo = getCanvasVideo(element, boardId)
      if (!embeddedVideo && !isCanvasVideoLink(element.link)) return null
      const video = embeddedVideo ? videosById.get(embeddedVideo.id) : undefined
      if (!video) return <UnavailableVideo />
      return (
        <CanvasVideo
          src={`/api/workspace/public/shares/${encodeURIComponent(token)}/videos/${encodeURIComponent(video.id)}/content`}
          name={video.name}
          active={
            appState.activeEmbeddable?.element.id === element.id &&
            appState.activeEmbeddable.state === 'active'
          }
        />
      )
    },
    [boardId, token, videosById]
  )

  const onLinkOpen = useCallback<NonNullable<ExcalidrawProps['onLinkOpen']>>(
    (element, event) => {
      if (isCanvasVideoLink(element.link)) event.preventDefault()
    },
    []
  )

  const renderTopRightUI = useCallback(
    () => (
      <div className="flex max-w-[min(26rem,70vw)] items-center gap-3 rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-white">
        <span className="truncate text-xs font-medium" title={name}>
          {name}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-neutral-400">
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          View only
        </span>
      </div>
    ),
    [name]
  )

  return (
    <Excalidraw
      initialData={initialData}
      excalidrawAPI={(api) => {
        apiRef.current = api
      }}
      onChange={(elements) => {
        if (!fittedRef.current && elements.length && apiRef.current) {
          fittedRef.current = true
          apiRef.current.scrollToContent(elements, {
            fitToViewport: true,
            maxZoom: 1,
          })
        }
      }}
      name={name}
      theme="light"
      viewModeEnabled
      validateEmbeddable={validateCanvasVideoLink}
      renderEmbeddable={renderEmbeddable}
      onLinkOpen={onLinkOpen}
      renderTopRightUI={renderTopRightUI}
      UIOptions={{
        canvasActions: {
          changeViewBackgroundColor: false,
          clearCanvas: false,
          loadScene: false,
          saveToActiveFile: false,
          toggleTheme: false,
        },
      }}
    >
      <MainMenu>
        <MainMenu.DefaultItems.Export />
        <MainMenu.DefaultItems.Help />
      </MainMenu>
    </Excalidraw>
  )
}
