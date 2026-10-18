'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@videoflow/react-video-editor'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { exportFileName, MAX_VIDEO_BYTES } from './media'
import { prepareExportVideo, type ExportResolution } from './export-settings'
import { installSourceCaptionTiming } from './captions-runtime'

export default function EditorExport({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (file: File) => Promise<unknown>
}) {
  const [resolution, setResolution] = useState<ExportResolution>('1080')
  const [fps, setFps] = useState('project')
  const [quality, setQuality] = useState<'medium' | 'high' | 'veryHigh'>('high')
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{
    file: File
    url: string
    saved: boolean
  } | null>(null)
  const abort = useRef<AbortController | null>(null)
  const resultUrl = result?.url
  useEffect(
    () => () => {
      abort.current?.abort()
    },
    []
  )
  useEffect(
    () => () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl)
    },
    [resultUrl]
  )

  async function render() {
    if (abort.current) return
    const controller = new AbortController()
    abort.current = controller
    setError('')
    setResult(null)
    setProgress(0)
    const state = useEditorStore.getState()
    state.bridge?.stop()
    state.setPlaying(false)
    try {
      const { BrowserRenderer } = await import('@videoflow/renderer-browser')
      const video = prepareExportVideo(state.video, {
        resolution,
        fps: fps === 'project' ? 'project' : Number(fps),
      })
      const renderer = new BrowserRenderer(video)
      let output: Blob
      try {
        installSourceCaptionTiming(renderer)
        output = await renderer.exportVideo({
          signal: controller.signal,
          videoQuality: quality,
          onProgress: (value) => {
            if (!controller.signal.aborted) setProgress(value)
          },
        })
      } finally {
        renderer.destroy()
      }
      if (controller.signal.aborted) return
      const file = new File([output], exportFileName(video.name), {
        type: 'video/mp4',
      })
      setResult({ file, url: URL.createObjectURL(file), saved: false })
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : 'Export failed. Try a lower resolution.'
        )
    } finally {
      abort.current = null
      setProgress(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!saving && progress === null) onOpenChange(value)
      }}
    >
      <DialogContent
        className="dark border-white/10 bg-neutral-950 text-white sm:max-w-md"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <DialogTitle>Export movie</DialogTitle>
        <DialogDescription className="sr-only">
          Choose video resolution, frame rate, and quality.
        </DialogDescription>
        {progress === null && !result ? (
          <div className="editor-export-options">
            <label>
              Resolution
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value as ExportResolution)}
              >
                <option value="720">720p</option>
                <option value="1080">1080p</option>
                <option value="2160">4K</option>
                <option value="original">Project size</option>
              </select>
            </label>
            <label>
              Frame rate
              <select value={fps} onChange={(e) => setFps(e.target.value)}>
                <option value="project">Match project</option>
                {[24, 25, 30, 60].map((value) => (
                  <option key={value} value={value}>
                    {value} fps
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quality
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as typeof quality)}
              >
                <option value="medium">Smaller file</option>
                <option value="high">High</option>
                <option value="veryHigh">Best</option>
              </select>
            </label>
            <Button
              onClick={() => void render()}
              className="mt-2 w-full bg-white text-black hover:bg-neutral-200"
            >
              Export MP4
            </Button>
          </div>
        ) : null}
        {progress !== null ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Rendering · {Math.round(progress * 100)}%
            </div>
            <progress
              aria-label="Export progress"
              className="w-full accent-violet-500"
              max={1}
              value={progress}
            />
            <Button
              variant="outline"
              onClick={() => {
                abort.current?.abort()
              }}
            >
              Cancel export
            </Button>
          </div>
        ) : null}
        {result ? (
          <div className="space-y-4">
            <video
              src={result.url}
              controls
              playsInline
              className="aspect-video w-full rounded bg-black"
              aria-label="Exported movie"
            />
            <p className="truncate text-xs text-neutral-400">
              {result.file.name} · {(result.file.size / 1024 / 1024).toFixed(1)}{' '}
              MB
            </p>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <a href={result.url} download={result.file.name}>
                  <Download className="size-4" />
                  Download
                </a>
              </Button>
              <Button
                disabled={
                  saving || result.saved || result.file.size > MAX_VIDEO_BYTES
                }
                onClick={async () => {
                  setSaving(true)
                  setError('')
                  try {
                    await onSave(result.file)
                    setResult({ ...result, saved: true })
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : 'Could not save video.'
                    )
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                {saving
                  ? 'Saving…'
                  : result.saved
                    ? 'Saved to board'
                    : 'Save to board'}
              </Button>
            </div>
            {result.file.size > MAX_VIDEO_BYTES ? (
              <p className="text-xs text-neutral-400">
                Board uploads are limited to 50 MB. Download this export or use
                a smaller size.
              </p>
            ) : null}
            <button
              className="text-xs text-neutral-400 underline"
              disabled={saving}
              onClick={() => setResult(null)}
            >
              Export again
            </button>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
