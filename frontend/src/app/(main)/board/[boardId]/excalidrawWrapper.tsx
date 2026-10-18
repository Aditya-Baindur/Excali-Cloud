'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Excalidraw,
  MainMenu,
  CaptureUpdateAction,
  convertToExcalidrawElements,
  hashElementsVersion,
  viewportCoordsToSceneCoords,
} from '@excalidraw/excalidraw'
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  ExcalidrawProps,
} from '@excalidraw/excalidraw/types'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import '@excalidraw/excalidraw/index.css'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import {
  ArrowLeft,
  CircleAlert,
  Loader2,
  Save,
  Search,
  Video,
} from 'lucide-react'
import { apiFetch, workerFetch } from '@/lib/api'
import type { Board, Video as BoardVideo } from '@/lib/types'
import { Button } from '@/components/ui/button'
import ShareButton from '@/components/sharing/ShareButton'
import BoardVideos from '@/components/videos/BoardVideos'
import CanvasVideo, { UnavailableVideo } from '@/components/videos/CanvasVideo'
import {
  canvasVideoLink,
  getCanvasVideo,
  isCanvasVideoLink,
  validateCanvasVideoLink,
} from '@/lib/canvas-video'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useBoardNavigation } from '@/components/workspace/BoardCommandMenu'
import { useBoardLibrary } from '@/components/excalidraw/useBoardLibrary'
import { createBoardSceneSaver } from '@/lib/board-scene-saver'

type RawScene = {
  elements?: readonly OrderedExcalidrawElement[]
  files?: BinaryFiles
  appState?: { viewBackgroundColor?: string; theme?: 'light' | 'dark' }
}
type SaveState = 'saved' | 'unsaved' | 'saving' | 'error'

function serializeScene(scene: RawScene) {
  return JSON.stringify({
    elements: scene.elements ?? [],
    files: scene.files ?? {},
    appState: {
      viewBackgroundColor: scene.appState?.viewBackgroundColor ?? '#ffffff',
      theme: scene.appState?.theme ?? 'light',
    },
  })
}

export default function ExcalidrawWrapper() {
  const { boardId } = useParams<{ boardId: string }>()
  // Route identity also scopes all in-flight saves and local canvas state.
  return <BoardEditor key={boardId} boardId={boardId} />
}

function BoardEditor({ boardId }: { boardId: string }) {
  const router = useRouter()
  const { getToken, userId } = useAuth()
  const { registerGuard, openMenu } = useBoardNavigation()
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null)
  useBoardLibrary(excalidrawAPI, userId)
  const handleExcalidrawAPI = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api
    setExcalidrawAPI(api)
  }, [])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [sceneSaver] = useState(createBoardSceneSaver)
  const lastChange = useRef('')
  const mountedRef = useRef(true)
  const [initialData, setInitialData] =
    useState<ExcalidrawInitialDataState | null>(null)
  const [boardName, setBoardName] = useState('Untitled board')
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [retry, setRetry] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const [videoDialogOpen, setVideoDialogOpen] = useState(false)

  useEffect(() => {
    mountedRef.current = true
    const controller = new AbortController()
    Promise.all([
      apiFetch<RawScene>(`/boards/${boardId}/scene`, {
        signal: controller.signal,
      }),
      apiFetch<{ boards: Board[] }>('/boards', { signal: controller.signal }),
    ])
      .then(([raw, { boards }]) => {
        if (controller.signal.aborted) return
        if (!Array.isArray(raw.elements))
          throw new Error('This board contains invalid scene data.')
        setBoardName(
          boards.find((board) => board.id === boardId)?.name ?? 'Untitled board'
        )
        setLoadError('')
        setInitialData({
          elements: raw.elements ?? [],
          files: raw.files ?? {},
          appState: {
            viewBackgroundColor: raw.appState?.viewBackgroundColor ?? '#ffffff',
            theme: raw.appState?.theme === 'dark' ? 'dark' : 'light',
            collaborators: new Map(),
          },
          scrollToContent: true,
        })
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(
            err instanceof Error ? err.message : 'Could not open this board.'
          )
      })
    return () => {
      mountedRef.current = false
      controller.abort()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [boardId, retry])

  const saveScene = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    try {
      if (mountedRef.current && sceneSaver.isDirty()) setSaveState('saving')
      // Never read the imperative API here: Excalidraw empties it on unmount.
      await sceneSaver.flush(async (payload) => {
        const token = await getToken()
        if (!token)
          throw new Error('Your session has expired. Please sign in again.')
        await workerFetch(`/boards/${boardId}/scene`, token, {
          method: 'PUT',
          body: payload,
        })
      })
      if (mountedRef.current) {
        setSaveState(sceneSaver.isDirty() ? 'unsaved' : 'saved')
        setSaveError('')
      }
    } catch (err) {
      if (mountedRef.current) {
        setSaveState('error')
        setSaveError(
          err instanceof Error ? err.message : 'Could not save your changes.'
        )
      }
      throw err
    }
  }, [boardId, getToken, sceneSaver])

  useEffect(
    () =>
      registerGuard(async () => {
        if (sceneSaver.isReady()) await saveScene()
      }),
    [registerGuard, saveScene, sceneSaver]
  )

  useEffect(
    () => () => {
      // The child canvas is already destroyed during passive effect cleanup.
      // Flush only the last immutable snapshot captured while it was alive.
      if (sceneSaver.isDirty()) void saveScene().catch(() => {})
    },
    [saveScene, sceneSaver]
  )

  const scheduleSave = useCallback<NonNullable<ExcalidrawProps['onChange']>>(
    (elements, state, files) => {
      if (!mountedRef.current || state.isLoading) return
      const change = JSON.stringify([
        hashElementsVersion(elements),
        state.viewBackgroundColor,
        state.theme,
        Object.values(files).map((file) => [
          file.id,
          file.dataURL,
          file.created,
        ]),
      ])
      if (change === lastChange.current) return
      lastChange.current = change
      // onChange includes deletion tombstones, so intentional clear-all is saved.
      const dirty = sceneSaver.capture(
        serializeScene({ elements, files, appState: state })
      )
      if (!dirty) {
        if (timerRef.current) clearTimeout(timerRef.current)
        setSaveState(sceneSaver.isSaving() ? 'saving' : 'saved')
        return
      }
      setSaveState('unsaved')
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        void saveScene().catch(() => {})
      }, 1000)
    },
    [saveScene, sceneSaver]
  )

  useEffect(() => {
    const saveShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveScene().catch(() => {})
      }
    }
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      if (sceneSaver.isDirty() || sceneSaver.isSaving()) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('keydown', saveShortcut, { capture: true })
    window.addEventListener('beforeunload', warnUnsaved)
    return () => {
      window.removeEventListener('keydown', saveShortcut, { capture: true })
      window.removeEventListener('beforeunload', warnUnsaved)
    }
  }, [saveScene, sceneSaver])

  async function backToDashboard() {
    setLeaving(true)
    try {
      await saveScene()
      router.push('/dashboard')
    } catch {
      setLeaving(false)
    }
  }

  function insertVideo(
    video: BoardVideo,
    dimensions: { width: number; height: number }
  ) {
    const api = apiRef.current
    if (!api || video.boardId !== boardId) return
    const state = api.getAppState()
    const center = viewportCoordsToSceneCoords(
      {
        clientX: state.offsetLeft + state.width / 2,
        clientY: state.offsetTop + state.height / 2,
      },
      state
    )
    const scale = Math.min(
      1,
      640 / dimensions.width,
      420 / dimensions.height,
      (state.width - 64) / state.zoom.value / dimensions.width,
      (state.height - 160) / state.zoom.value / dimensions.height
    )
    const width = dimensions.width * scale
    const height = dimensions.height * scale
    // The converter initializes generic shapes, but expects embeddables to
    // already contain every field. Build a complete base before changing type.
    const [base] = convertToExcalidrawElements([
      {
        type: 'rectangle',
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
        strokeWidth: 0,
        strokeColor: 'transparent',
        backgroundColor: '#000000',
        fillStyle: 'solid',
        roughness: 0,
        link: canvasVideoLink(boardId, video.id),
        customData: {
          type: 'board-video',
          boardId,
          videoId: video.id,
          name: video.name,
        },
      },
    ])
    const element = { ...base, type: 'embeddable' as const }
    api.updateScene({
      elements: [...api.getSceneElementsIncludingDeleted(), element],
      appState: {
        selectedElementIds: { [element.id]: true },
        selectedGroupIds: {},
        activeEmbeddable: null,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    })
    api.setActiveTool({ type: 'selection' })
    setVideoDialogOpen(false)
  }

  if (loadError)
    return (
      <main className="dark flex min-h-dvh items-center justify-center bg-neutral-950 p-6 text-white">
        <div className="max-w-sm text-center">
          <CircleAlert className="mx-auto mb-4 size-8 text-neutral-500" />
          <h1 className="text-xl font-semibold">Could not open this board</h1>
          <p role="alert" className="my-3 text-sm text-neutral-400">
            {loadError}
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => router.push('/dashboard')}>
              Back to boards
            </Button>
            <Button
              className="bg-violet-600 text-white hover:bg-violet-700"
              onClick={() => {
                setLoadError('')
                setRetry((value) => value + 1)
              }}
            >
              Try again
            </Button>
          </div>
        </div>
      </main>
    )
  if (!initialData)
    return (
      <main
        role="status"
        className="dark flex min-h-dvh items-center justify-center gap-3 bg-neutral-950 text-sm text-neutral-400"
      >
        <Loader2 className="size-5 animate-spin" />
        Loading…
      </main>
    )

  const saveLabel =
    saveState === 'saving'
      ? 'Saving…'
      : saveState === 'error'
        ? 'Save failed'
        : saveState === 'unsaved'
          ? 'Unsaved changes'
          : 'Saved'

  return (
    <main
      aria-label={boardName}
      className="fixed inset-0 h-dvh w-full overflow-hidden"
    >
      <h1 className="sr-only">{boardName}</h1>
      <span role="status" className="sr-only">
        {saveLabel}
      </span>
      <Excalidraw
        name={boardName}
        initialData={initialData}
        excalidrawAPI={handleExcalidrawAPI}
        onChange={scheduleSave}
        validateEmbeddable={validateCanvasVideoLink}
        onLinkOpen={(element, event) => {
          if (isCanvasVideoLink(element.link)) event.preventDefault()
        }}
        renderEmbeddable={(element, state) => {
          const video = getCanvasVideo(element, boardId)
          if (!video)
            return isCanvasVideoLink(element.link) ? <UnavailableVideo /> : null
          return (
            <CanvasVideo
              src={`/api/workspace/boards/${encodeURIComponent(boardId)}/videos/${encodeURIComponent(video.id)}/content`}
              name={video.name}
              active={
                state.activeEmbeddable?.element.id === element.id &&
                state.activeEmbeddable.state === 'active'
              }
            />
          )
        }}
        renderTopRightUI={(isMobile) =>
          isMobile ? null : (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="relative border-0 bg-black text-white shadow-none hover:bg-neutral-800"
                onClick={() => void saveScene().catch(() => {})}
                disabled={saveState === 'saving'}
                aria-label={`Save board — ${saveLabel}`}
                title={`${saveLabel} (⌘/Ctrl S)`}
              >
                {saveState === 'saving' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  'Save'
                )}
                {saveState === 'error' || saveState === 'unsaved' ? (
                  <span
                    aria-hidden="true"
                    className={`absolute -top-0.5 -right-0.5 size-1.5 rounded-full ${saveState === 'error' ? 'bg-red-500' : 'bg-amber-400'}`}
                  />
                ) : null}
              </Button>
              <Button
                size="sm"
                className="border-0 bg-black text-white shadow-none hover:bg-neutral-800"
                disabled={leaving}
                onClick={() => void backToDashboard()}
              >
                Dashboard
              </Button>
              <ShareButton
                boardId={boardId}
                beforeShare={saveScene}
                compact
                className="border-0 bg-black text-white hover:bg-neutral-800 hover:text-white"
              />
            </div>
          )
        }
      >
        <MainMenu>
          <MainMenu.Group title={boardName}>
            <MainMenu.Item
              icon={<Save className="size-4" />}
              onSelect={() => void saveScene().catch(() => {})}
              disabled={saveState === 'saving'}
            >
              Save board
            </MainMenu.Item>
            <MainMenu.Item
              icon={<ArrowLeft className="size-4" />}
              onSelect={() => void backToDashboard()}
              disabled={leaving}
            >
              Dashboard
            </MainMenu.Item>
            <MainMenu.Item
              icon={<Search className="size-4" />}
              shortcut="⌘ / Ctrl K"
              onSelect={() => requestAnimationFrame(openMenu)}
            >
              Switch board
            </MainMenu.Item>
            <MainMenu.Item
              icon={<Video className="size-4" />}
              onSelect={() =>
                requestAnimationFrame(() => setVideoDialogOpen(true))
              }
            >
              Insert video
            </MainMenu.Item>
            <MainMenu.ItemCustom>
              <ShareButton
                boardId={boardId}
                beforeShare={saveScene}
                compact
                className="w-full justify-start border-0 bg-transparent text-[var(--text-primary-color)] hover:bg-[var(--button-hover-bg)] hover:text-[var(--text-primary-color)]"
              />
            </MainMenu.ItemCustom>
          </MainMenu.Group>
          <MainMenu.Separator />
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveToActiveFile />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.Help />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ToggleTheme />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
      </Excalidraw>
      <Dialog open={videoDialogOpen} onOpenChange={setVideoDialogOpen}>
        <DialogContent
          data-prevent-outside-click
          className="Dialog dark border-white/10 bg-neutral-950 text-white sm:max-w-md"
        >
          <DialogTitle>Insert video</DialogTitle>
          <DialogDescription className="sr-only">
            Upload a video or add an existing upload to the canvas.
          </DialogDescription>
          {videoDialogOpen ? (
            <BoardVideos boardId={boardId} onInsert={insertVideo} />
          ) : null}
        </DialogContent>
      </Dialog>
      {saveError ? (
        <div
          role="alert"
          className="dark absolute bottom-20 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-neutral-950 px-4 py-3 text-sm text-red-300 shadow-lg"
        >
          <span>{saveError}</span>
          <button
            className="shrink-0 font-medium underline"
            onClick={() => void saveScene().catch(() => {})}
          >
            Retry save
          </button>
        </div>
      ) : null}
    </main>
  )
}
