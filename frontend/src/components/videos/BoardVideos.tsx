'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import {
  Loader2,
  Plus,
  Scissors,
  Upload,
  Video as VideoIcon,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { readVideoDimensions } from '@/lib/canvas-video'
import type { Video } from '@/lib/types'
import { Button } from '@/components/ui/button'

const MAX_VIDEO_BYTES = 50 * 1024 * 1024
const SUPPORTED_TYPES = new Set(['video/mp4', 'video/webm', 'video/ogg'])

export default function BoardVideos({
  boardId,
  onInsert,
}: {
  boardId: string
  onInsert: (
    video: Video,
    dimensions: { width: number; height: number }
  ) => void
}) {
  const { getToken } = useAuth()
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [insertingId, setInsertingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<XMLHttpRequest | null>(null)
  const uploadCancelledRef = useRef(false)
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    const controller = new AbortController()
    apiFetch<{ videos: Video[] }>(`/boards/${boardId}/videos`, {
      signal: controller.signal,
    })
      .then(({ videos }) => {
        if (!controller.signal.aborted) setVideos(videos)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error ? err.message : 'Could not load videos.'
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => {
      mountedRef.current = false
      uploadCancelledRef.current = true
      controller.abort()
      uploadRef.current?.abort()
    }
  }, [boardId])
  async function upload(file: File) {
    if (uploadProgress !== null) return
    const extension = file.name.split('.').pop()?.toLowerCase()
    const mimeType =
      file.type ||
      ({ mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg' }[
        extension || ''
      ] ??
        '')
    if (!SUPPORTED_TYPES.has(mimeType)) {
      setError('Choose an MP4, WebM, or Ogg video.')
      return
    }
    if (!file.size || file.size > MAX_VIDEO_BYTES) {
      setError('Choose a nonempty video up to 50 MB.')
      return
    }
    setError('')
    setUploadProgress(0)
    uploadCancelledRef.current = false
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE
      if (!base) throw new Error('Video uploads are not configured.')
      const token = await getToken()
      if (uploadCancelledRef.current) throw new Error('Upload cancelled.')
      if (!token) throw new Error('Please sign in again to upload videos.')
      if (!mountedRef.current) return
      // Upload straight to the Worker; serverless frontend request limits are smaller than videos.
      const video = await new Promise<Video>((resolve, reject) => {
        const request = new XMLHttpRequest()
        uploadRef.current = request
        request.open(
          'POST',
          `${base.replace(/\/$/, '')}/boards/${boardId}/videos`
        )
        request.setRequestHeader('Authorization', `Bearer ${token}`)
        request.setRequestHeader('Content-Type', mimeType)
        request.setRequestHeader('X-File-Name', encodeURIComponent(file.name))
        request.timeout = 10 * 60 * 1000
        request.upload.onprogress = (event) => {
          if (event.lengthComputable)
            setUploadProgress(Math.round((event.loaded / event.total) * 100))
        }
        request.onerror = () =>
          reject(
            new Error('Upload failed. Check your connection and try again.')
          )
        request.ontimeout = () =>
          reject(new Error('Upload timed out. Please try again.'))
        request.onabort = () => reject(new Error('Upload cancelled.'))
        request.onload = () => {
          try {
            const data = JSON.parse(request.responseText)
            if (request.status < 200 || request.status >= 300)
              throw new Error(data.error || 'Upload failed.')
            resolve(data.video)
          } catch (err) {
            reject(err instanceof Error ? err : new Error('Upload failed.'))
          }
        }
        request.send(file)
      })
      if (mountedRef.current) {
        setVideos((current) => [video, ...current])
        const objectUrl = URL.createObjectURL(file)
        try {
          const dimensions = await readVideoDimensions(objectUrl)
          if (mountedRef.current) onInsert(video, dimensions)
        } finally {
          URL.revokeObjectURL(objectUrl)
        }
      }
    } catch (err) {
      if (mountedRef.current)
        setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      uploadRef.current = null
      if (mountedRef.current) setUploadProgress(null)
    }
  }

  async function insertExisting(video: Video) {
    setInsertingId(video.id)
    const dimensions = await readVideoDimensions(
      `/api/workspace/boards/${encodeURIComponent(boardId)}/videos/${encodeURIComponent(video.id)}/content`
    )
    if (mountedRef.current) {
      onInsert(video, dimensions)
      setInsertingId(null)
    }
  }

  const busy = uploadProgress !== null || insertingId !== null

  return (
    <section aria-label="Insert video" className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm,video/ogg,.mp4,.webm,.ogv"
        className="sr-only"
        aria-label="Choose a video"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void upload(file)
        }}
      />
      <Button
        className="w-full bg-white text-black hover:bg-neutral-200"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" aria-hidden="true" />
        {uploadProgress === null ? 'Upload video' : 'Uploading…'}
      </Button>
      <p className="text-center text-xs text-neutral-500">
        MP4, WebM, Ogg · up to 50 MB
      </p>
      <Link
        href={`/editor?boardId=${encodeURIComponent(boardId)}`}
        className="block text-center text-xs text-violet-400 underline underline-offset-4 hover:text-violet-300"
      >
        Open video editor
      </Link>
      {uploadProgress !== null ? (
        <div className="space-y-2">
          <progress
            aria-label="Upload progress"
            value={uploadProgress}
            max={100}
            className="h-2 w-full accent-white"
          />
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span role="status">
              {uploadProgress === 100
                ? 'Adding to board…'
                : `${uploadProgress}%`}
            </span>
            <button
              onClick={() => {
                uploadCancelledRef.current = true
                uploadRef.current?.abort()
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
      {loading ? (
        <Loader2
          aria-label="Loading videos"
          className="mx-auto size-4 animate-spin text-neutral-500"
        />
      ) : null}
      {videos.length ? (
        <div className="max-h-64 space-y-1 overflow-y-auto border-t border-white/10 pt-3">
          {videos.map((video) => (
            <div key={video.id} className="flex items-center gap-1">
              <button
                disabled={busy}
                onClick={() => void insertExisting(video)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-3 text-left text-sm hover:bg-white/5 disabled:opacity-50"
                aria-label={`Insert ${video.name}`}
              >
                <VideoIcon className="size-4 shrink-0 text-neutral-500" />
                <span className="min-w-0 flex-1 truncate">{video.name}</span>
                {insertingId === video.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
              </button>
              <Link
                href={`/editor?boardId=${encodeURIComponent(boardId)}&videoId=${encodeURIComponent(video.id)}`}
                aria-label={`Edit ${video.name}`}
                title="Edit video"
                className="shrink-0 rounded-md p-3 text-neutral-400 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-violet-500"
              >
                <Scissors className="size-4" aria-hidden="true" />
              </Link>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
