'use client'

import { useState } from 'react'
import { Download, Film, Loader2, Trash2 } from 'lucide-react'
import type { Video } from '@/lib/types'

type VideoGalleryProps = {
  videos: Video[]
  getVideoUrl: (video: Video) => string
  onDelete?: (video: Video) => void | Promise<void>
  deletingId?: string | null
  emptyLabel?: string
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function VideoCard({
  video,
  url,
  onDelete,
  isDeleting,
}: {
  video: Video
  url: string
  onDelete?: VideoGalleryProps['onDelete']
  isDeleting: boolean
}) {
  const [playbackError, setPlaybackError] = useState(false)

  return (
    <article className="dark overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/60">
      <div className="bg-black">
        <video
          className="aspect-video w-full object-contain"
          controls
          playsInline
          preload="metadata"
          aria-label={video.name}
          onError={() => setPlaybackError(true)}
          onLoadedMetadata={() => setPlaybackError(false)}
          src={url}
        >
          Playback is unsupported. Download the video to watch it.
        </video>
      </div>
      <div className="p-4">
        <h3
          className="truncate text-sm font-medium text-white"
          title={video.name}
        >
          {video.name}
        </h3>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-neutral-400">{formatSize(video.size)}</p>
          <div className="flex items-center gap-1">
            <a
              href={url}
              download={video.name}
              aria-label={`Download ${video.name}`}
              title="Download video"
              className="rounded-lg p-2 text-neutral-400 transition hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
            </a>
            {onDelete ? (
              <button
                type="button"
                onClick={() => void onDelete(video)}
                disabled={isDeleting}
                aria-label={`Delete ${video.name}`}
                title="Delete video"
                className="rounded-lg p-2 text-neutral-400 transition hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:cursor-wait disabled:opacity-50"
              >
                {isDeleting ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            ) : null}
          </div>
        </div>
        {playbackError ? (
          <p
            role="status"
            className="mt-3 text-xs leading-relaxed text-neutral-300"
          >
            Playback failed. Try downloading the video.
          </p>
        ) : null}
      </div>
    </article>
  )
}

export default function VideoGallery({
  videos,
  getVideoUrl,
  onDelete,
  deletingId,
  emptyLabel = 'No videos yet.',
}: VideoGalleryProps) {
  if (videos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center">
        <Film
          className="mx-auto mb-3 h-6 w-6 text-neutral-500"
          aria-hidden="true"
        />
        <p className="text-sm text-neutral-400">{emptyLabel}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {videos.map((video) => (
        <VideoCard
          key={video.id}
          video={video}
          url={getVideoUrl(video)}
          onDelete={onDelete}
          isDeleting={deletingId === video.id}
        />
      ))}
    </div>
  )
}
