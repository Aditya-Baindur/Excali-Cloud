'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { ArrowLeft, Film, FolderOpen, X } from 'lucide-react'
import {
  commands,
  layerTimelineBounds,
  layerTypeFromFile,
  useEditorStore,
  VideoEditor,
  type VideoJSON,
} from '@videoflow/react-video-editor'
import '@videoflow/react-video-editor/style.css'
import './editor.css'
import { apiFetch } from '@/lib/api'
import type { Board, Video } from '@/lib/types'
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell'
import { useBoardNavigation } from '@/components/workspace/BoardCommandMenu'
import { draftKey, loadDraft, restoreDraft, saveDraft } from './drafts'
import {
  emptyProject,
  MAX_VIDEO_BYTES,
  projectFromVideo,
  readVideoMetadata,
  readAudioDuration,
  uploadBoardVideo,
  videoUrl,
} from './media'
import {
  EditorContext,
  type LibraryTab,
  type MediaAsset,
} from './EditorContext'
import { EDITOR_PANELS } from './EditorPanels'
import EditorExport from './EditorExport'
import { installSourceCaptionTiming } from './captions-runtime'
import {
  captionsLayerFromCues,
  exportProjectBackup,
  importProjectBackup,
  parseSubtitles,
  projectBackupFileName,
  MAX_PROJECT_BACKUP_BYTES,
} from './project-tools'

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.'
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

function localMedia(assets: Map<string, Blob>): MediaAsset[] {
  return [...assets].map(([source, blob], index) => ({
    id: source,
    source,
    name:
      blob instanceof File
        ? blob.name
        : `Imported ${blob.type.split('/')[0]} ${index + 1}`,
    type: blob.type.startsWith('image/')
      ? ('image' as const)
      : blob.type.startsWith('video/')
        ? ('video' as const)
        : ('audio' as const),
  }))
}

export default function EditorWorkspace(props: { boardId?: string; videoId?: string }) {
  const { userId } = useAuth()
  return <UserEditorWorkspace key={userId ?? 'signed-out'} {...props} />
}

function UserEditorWorkspace({
  boardId,
  videoId,
}: {
  boardId?: string
  videoId?: string
}) {
  const { userId } = useAuth()
  const [boards, setBoards] = useState<Board[] | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    if (!userId) return () => controller.abort()
    apiFetch<{ boards: Board[] }>('/boards', { signal: controller.signal })
      .then(({ boards }) => {
        if (controller.signal.aborted) return
        setBoards(boards)
        setError('')
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setError(message(error))
      })
    return () => controller.abort()
  }, [attempt, userId])

  const board = boards?.find((item) => item.id === boardId)
  if (board && userId) {
    return (
      <EditorSession
        key={draftKey(userId, board.id, videoId)}
        board={board}
        userId={userId}
        videoId={videoId}
      />
    )
  }

  return (
    <WorkspaceShell section="Video editor">
      <div className="max-w-3xl">
        <div className="mb-5 flex size-12 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-400">
          <Film aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Video editor</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-400">
          Choose a board to start editing.
        </p>
        {error ? (
          <div role="alert" className="mt-6 text-sm text-red-300">
            {error}{' '}
            <button
              className="ml-2 underline"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        ) : null}
        {!boards && !error ? (
          <p role="status" className="mt-8 text-sm text-neutral-400">
            Loading your boards…
          </p>
        ) : null}
        {boards && boardId && !board ? (
          <p role="alert" className="mt-6 text-sm text-amber-300">
            That board is unavailable. Choose one of your boards below.
          </p>
        ) : null}
        {boards?.length === 0 ? (
          <div className="mt-8 rounded-xl border border-white/10 p-6 text-sm text-neutral-400">
            Create a board first to keep your videos together.
            <Link
              href="/dashboard"
              className="mt-4 block text-violet-400 underline"
            >
              Go to boards
            </Link>
          </div>
        ) : null}
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {boards?.map((item) => (
            <Link
              key={item.id}
              href={`/editor?boardId=${encodeURIComponent(item.id)}`}
              className="flex items-center gap-4 rounded-xl border border-white/10 bg-neutral-900/50 p-5 transition hover:border-violet-500/50 hover:bg-neutral-900 focus-visible:outline-2 focus-visible:outline-violet-500"
            >
              <FolderOpen
                className="size-5 shrink-0 text-violet-400"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="truncate font-medium">{item.name}</p>
                {item.folderName ? (
                  <p className="mt-1 truncate text-xs text-neutral-500">
                    {item.folderName}
                  </p>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </WorkspaceShell>
  )
}

function EditorSession({
  board,
  userId,
  videoId,
}: {
  board: Board
  userId: string
  videoId?: string
}) {
  const { getToken } = useAuth()
  const router = useRouter()
  const { registerGuard } = useBoardNavigation()
  const storageKey = draftKey(userId, board.id, videoId)
  const [project, setProject] = useState<VideoJSON | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [localAssets, setLocalAssets] = useState<MediaAsset[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [draftStatus, setDraftStatus] = useState('Drafts save in this browser')
  const [libraryOpen, setLibraryOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 620)
  const [inspectorOpen, setInspectorOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 900)
  const [libraryTab, setLibraryTab] = useState<LibraryTab>('media')
  const [busy, setBusy] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [exportOpen, setExportOpen] = useState(false)
  const assets = useRef(new Map<string, Blob>())
  const latest = useRef<VideoJSON | null>(null)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const controllerRef = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const projectInput = useRef<HTMLInputElement>(null)
  const captionsInput = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const recordingRef = useRef(false)
  const [recording, setRecordingState] = useState(false)
  const setRecording = (value: boolean) => { recordingRef.current = value; setRecordingState(value) }
  const metadata = useRef(
    new Map<string, { duration: number; width?: number; height?: number }>()
  )

  const persist = useCallback(
    (video: VideoJSON) => {
      const session = controllerRef.current
      const snapshot = new Map(assets.current)
      const operation = saveQueue.current
        .catch(() => {})
        .then(() => saveDraft(storageKey, video, snapshot))
      saveQueue.current = operation
      return operation
        .then(() => {
          if (!session?.signal.aborted && session === controllerRef.current && latest.current === video) {
            dirty.current = false
            useEditorStore.getState().markSaved()
            if (!controllerRef.current?.signal.aborted)
              setDraftStatus('Draft saved in this browser')
          }
        })
        .catch((error: unknown) => {
          if (!controllerRef.current?.signal.aborted)
            setDraftStatus(`Draft could not be saved: ${message(error)}`)
          throw error
        })
    },
    [storageKey]
  )

  useEffect(() => {
    const controller = new AbortController()
    controllerRef.current = controller
    const savedAssets = assets.current
    async function initialize() {
      try {
        const [{ videos: library }, draft] = await Promise.all([
          apiFetch<{ videos: Video[] }>(
            `/boards/${encodeURIComponent(board.id)}/videos`,
            { signal: controller.signal }
          ),
          loadDraft(storageKey).catch(() => {
            if (!controller.signal.aborted)
              setDraftStatus('Browser draft storage is unavailable')
            return undefined
          }),
        ])
        if (controller.signal.aborted) return
        setVideos(library)
        const source = library.find((item) => item.id === videoId)
        if (videoId && !source && !draft)
          throw new Error(
            'This video is no longer available. Choose another clip from your board.'
          )
        const initial = draft
          ? restoreDraft(draft, savedAssets)
          : source
            ? await projectFromVideo(board, source, controller.signal)
            : emptyProject(`${board.name} — video`)
        if (controller.signal.aborted) return
        latest.current = initial
        setLocalAssets(localMedia(savedAssets))
        setProject(initial)
        if (draft) setDraftStatus('Draft restored from this browser')
        setError('')
      } catch (error) {
        if (!controller.signal.aborted) setError(message(error))
      }
    }
    void initialize()
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current || busyRef.current || recordingRef.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      controller.abort()
      window.removeEventListener('beforeunload', beforeUnload)
      if (timer.current) clearTimeout(timer.current)
      if (dirty.current && latest.current)
        void persist(latest.current).catch(() => {})
      for (const url of savedAssets.keys()) URL.revokeObjectURL(url)
      savedAssets.clear()
      useEditorStore.getState().bridge?.stop()
      useEditorStore.getState().setPlaying(false)
    }
  }, [board, videoId, storageKey, attempt, persist])

  const flushBeforeLeaving = useCallback(async () => {
    if (busyRef.current || recordingRef.current)
      throw new Error('Finish importing or recording before leaving the editor.')
    if (timer.current) clearTimeout(timer.current)
    if (latest.current && dirty.current) await persist(latest.current)
  }, [persist])
  useEffect(() => registerGuard(flushBeforeLeaving), [registerGuard, flushBeforeLeaving])

  useEffect(() => useEditorStore.subscribe((state, previous) => {
    if (state.bridge && state.bridge !== previous.bridge)
      installSourceCaptionTiming(state.bridge.renderer)
  }), [])

  const onChange = useCallback(
    (video: VideoJSON) => {
      latest.current = video
      dirty.current = true
      setDraftStatus('Saving draft…')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        void persist(video).catch(() => {})
      }, 700)
    },
    [persist]
  )

  async function storeVideo(file: File) {
    const token = await getToken()
    if (!token) throw new Error('Please sign in again to save videos.')
    const video = await uploadBoardVideo(
      board.id,
      file,
      token,
      controllerRef.current?.signal
    )
    if (controllerRef.current?.signal.aborted)
      throw new Error('Upload cancelled.')
    setVideos((current) => [
      video,
      ...current.filter((item) => item.id !== video.id),
    ])
    return video
  }

  async function run(label: string, action: () => Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(label)
    setError('')
    try {
      await action()
    } catch (error) {
      if (!controllerRef.current?.signal.aborted) setError(message(error))
    } finally {
      busyRef.current = false
      if (!controllerRef.current?.signal.aborted) setBusy('')
    }
  }

  async function onUpload(file: File) {
    if (!file.size || file.size > MAX_VIDEO_BYTES)
      throw new Error('Choose a media file up to 50 MB.')
    const kind = layerTypeFromFile(file)
    if (!kind) throw new Error(`Unsupported media: ${file.name}`)
    if (kind === 'video') return videoUrl(board.id, (await storeVideo(file)).id)
    const source = URL.createObjectURL(file)
    assets.current.set(source, file)
    setLocalAssets(localMedia(assets.current))
    return source
  }

  async function insertAsset(
    asset: MediaAsset,
    atPlayhead = false,
    exactStart?: number,
    placement?: { startTime: number; track: number; groupPath?: string[] }
  ) {
    let info = metadata.current.get(asset.source)
    if (!info) {
      info =
        asset.type === 'video'
          ? await readVideoMetadata(asset.source, controllerRef.current?.signal)
          : asset.type === 'audio'
            ? {
                duration: await readAudioDuration(
                  asset.source,
                  controllerRef.current?.signal
                ),
              }
            : { duration: 5 }
      metadata.current.set(asset.source, info)
    }
    if (controllerRef.current?.signal.aborted) return
    const state = useEditorStore.getState()
    const path = placement?.groupPath ?? (placement ? state.activeGroupPath : [])
    if (!placement) state.exitToRoot()
    let layers = state.video.layers
    for (const id of path) {
      const group = layers.find((layer) => layer.id === id)
      if (!group || group.type !== 'group') throw new Error('That clip group is no longer available.')
      layers = group.children ?? []
    }
    const track = placement?.track ?? (
      asset.type === 'audio' || atPlayhead
        ? Math.max(-1, ...state.video.layers.map((layer) => layer.track ?? 0)) +
          1
        : 0)
    const end = Math.max(
      0,
      ...state.video.layers
        .filter((layer) => (layer.track ?? 0) === track)
        .map((layer) => layerTimelineBounds(layer).end)
    )
    const startTime =
      placement?.startTime ?? exactStart ??
      (atPlayhead || asset.type === 'audio'
        ? state.currentFrame / state.video.fps
        : end)
    const id = await commands.addLayerCommand(
      state.commit,
      {
        type: asset.type,
        source: asset.source,
        sourceDuration: info.duration,
        mediaDuration: asset.type === 'image' ? undefined : info.duration,
        startTime,
        properties: asset.type === 'image' ? { fit: 'contain' } : {},
      },
      undefined,
      track,
      path
    )
    useEditorStore.getState().selectLayers([id])
    const seekTime = placement ? state.currentFrame : Math.round(startTime * state.video.fps)
    useEditorStore.getState().setCurrentFrame(seekTime)
    await useEditorStore
      .getState()
      .bridge?.seek(seekTime)
  }

  async function importFiles(files: File[], startTime?: number, placement?: { startTime: number; track: number; groupPath?: string[] }) {
    await run('Importing media…', async () => {
      const errors: string[] = []
      for (const file of files) {
        if (controllerRef.current?.signal.aborted) break
        setBusy(`Importing ${file.name}`)
        try {
          const type = layerTypeFromFile(file)
          if (!type) throw new Error(`Unsupported media: ${file.name}`)
          const source = await onUpload(file)
          await insertAsset(
            { id: source, source, type, name: file.name },
            false,
            startTime,
            placement
          )
        } catch (error) {
          errors.push(message(error))
        }
      }
      if (errors.length) throw new Error(errors.join(' '))
    })
  }

  const importRef = useRef(importFiles)
  useEffect(() => {
    importRef.current = importFiles
    if (project) useEditorStore.getState().setMediaImporter((files, placement) => importRef.current(files, undefined, placement))
  })
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (
        (event.target as HTMLElement)?.closest(
          'input,textarea,[contenteditable="true"]'
        )
      )
        return
      const files = Array.from(event.clipboardData?.files ?? [])
      if (!files.length) return
      event.preventDefault()
      event.stopImmediatePropagation()
      void importRef.current(files)
    }
    window.addEventListener('paste', paste, { capture: true })
    return () => window.removeEventListener('paste', paste, { capture: true })
  }, [])

  return (
    <div
      className={`editor-session dark ${inspectorOpen ? 'with-inspector' : ''}`}
    >
      <h1 className="sr-only">Video editor — {board.name}</h1>
      <span role="status" className="sr-only">
        {draftStatus}
      </span>
      <input
        ref={input}
        type="file"
        multiple
        accept="video/mp4,video/webm,video/ogg,audio/*,image/*,.mp4,.webm,.ogv,.mp3,.wav,.m4a,.flac"
        className="sr-only"
        aria-label="Import media into editor"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (files.length) void importFiles(files)
        }}
      />
      <input
        ref={projectInput}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        aria-label="Open video project"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file)
            void run('Opening project…', async () => {
              if (file.size > MAX_PROJECT_BACKUP_BYTES)
                throw new Error('That project backup is too large.')
              const imported = await importProjectBackup(file)
              if (controllerRef.current?.signal.aborted) {
                for (const url of imported.assets.keys())
                  URL.revokeObjectURL(url)
                return
              }
              for (const [url, blob] of imported.assets)
                assets.current.set(url, blob)
              setLocalAssets(localMedia(assets.current))
              const state = useEditorStore.getState()
              state.bridge?.stop()
              state.setPlaying(false)
              state.exitToRoot()
              state.clearSelection()
              await state.commit(
                (draft) => {
                  Object.assign(draft, imported.video)
                  if (!imported.video.tracks) delete draft.tracks
                },
                { label: 'Open project' }
              )
              state.setCurrentFrame(0)
              await state.bridge?.seek(0)
              setNotice(imported.warnings.join(' '))
            })
        }}
      />
      <input
        ref={captionsInput}
        type="file"
        accept=".srt,.vtt,text/vtt,text/plain"
        className="sr-only"
        aria-label="Import subtitles"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file)
            void run('Importing subtitles…', async () => {
              if (file.size > 5 * 1024 * 1024)
                throw new Error('Choose a subtitle file up to 5 MB.')
              const cues = parseSubtitles(await file.text())
              if (controllerRef.current?.signal.aborted) return
              const state = useEditorStore.getState()
              const layer = captionsLayerFromCues(cues, {
                track:
                  Math.max(
                    -1,
                    ...state.video.layers.map((layer) => layer.track ?? 0)
                  ) + 1,
              })
              state.exitToRoot()
              await state.commit(
                (draft) => {
                  draft.layers.push(layer)
                },
                { label: 'Import subtitles' }
              )
              state.selectLayers([layer.id])
              setInspectorOpen(true)
            })
        }}
      />
      {/could not|unavailable/.test(draftStatus) ? (
        <p role="alert" className="editor-alert warning">
          {draftStatus}
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="editor-alert">
          <span>{error}</span>
          {project ? (
            <button aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={15} />
            </button>
          ) : (
            <button onClick={() => setAttempt((value) => value + 1)}>
              Try again
            </button>
          )}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="editor-alert notice">
          <span>{notice}</span>
          <button aria-label="Dismiss notice" onClick={() => setNotice('')}>
            <X size={15} />
          </button>
        </div>
      ) : null}
      {project ? (
        <EditorContext.Provider
          value={{
            boardId: board.id,
            boardName: board.name,
            busy,
            recording,
            setRecording,
            leaveEditor: async () => {
              await flushBeforeLeaving()
              router.push(`/board/${encodeURIComponent(board.id)}`)
            },
            libraryOpen,
            inspectorOpen,
            libraryTab,
            assets: [
              ...videos.map((video) => ({
                id: video.id,
                name: video.name,
                type: 'video' as const,
                source: videoUrl(board.id, video.id),
              })),
              ...localAssets,
            ],
            setLibraryOpen,
            setInspectorOpen,
            setLibraryTab,
            importMedia: () => input.current?.click(),
            addAsset: async (asset, atPlayhead) =>
              run('Adding clip…', () => insertAsset(asset, atPlayhead)),
            recordAudio: (file, startTime) => importFiles([file], startTime),
            importCaptions: () => captionsInput.current?.click(),
            importProject: () => projectInput.current?.click(),
            backupProject: () =>
              void run('Preparing project…', async () => {
                const current = useEditorStore.getState().video
                const backup = await exportProjectBackup(current, assets.current)
                if (!controllerRef.current?.signal.aborted) download(backup, projectBackupFileName(current.name))
              }),
            exportVideo: () => {
              if (recordingRef.current || busyRef.current) {
                setError('Finish importing or recording before exporting.')
                return
              }
              useEditorStore.getState().bridge?.stop()
              useEditorStore.getState().setPlaying(false)
              setExportOpen(true)
            },
            reportError: (value) => setError(message(value)),
          }}
        >
          <main
            id="video-editor-workspace" aria-label="Video editing workspace"
            className="video-editor-frame"
            onDragOverCapture={(event) => {
              if (event.dataTransfer.types.includes('Files'))
                event.preventDefault()
            }}
            onDropCapture={(event) => {
              const files = Array.from(event.dataTransfer.files)
              if (files.length) {
                event.preventDefault()
                event.stopPropagation()
                void importFiles(files)
              }
            }}
          >
            <VideoEditor
              video={project}
              onChange={onChange}
              onSave={async (video) => {
                if (timer.current) clearTimeout(timer.current)
                await persist(video)
              }}
              onUpload={onUpload}
              components={EDITOR_PANELS}
              theme="dark"
            />
          </main>
        </EditorContext.Provider>
      ) : (
        <div className="editor-loading">
          <Link href={`/board/${encodeURIComponent(board.id)}`}>
            <ArrowLeft size={16} /> Back to board
          </Link>
          {!error ? <p role="status">Loading editor…</p> : null}
        </div>
      )}
      <EditorExport
        open={exportOpen}
        onOpenChange={setExportOpen}
        onSave={storeVideo}
      />
    </div>
  )
}
