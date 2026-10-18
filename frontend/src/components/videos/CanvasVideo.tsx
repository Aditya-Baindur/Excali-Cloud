'use client'

import { useEffect, useRef, useState } from 'react'
import { Play, VideoOff } from 'lucide-react'
import './canvas-video.css'

export function UnavailableVideo() {
  return (
    <div className="flex h-full w-full items-center justify-center gap-2 bg-neutral-950 text-sm text-neutral-400">
      <VideoOff className="size-5" aria-hidden="true" />
      Video unavailable
    </div>
  )
}

export default function CanvasVideo({
  src,
  name,
  active,
}: {
  src: string
  name: string
  active: boolean
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    // Excalidraw activates embeds when their center is clicked. Start playback
    // on that gesture; native controls handle subsequent pause/seek/fullscreen.
    const video = ref.current
    if (active) void video?.play().catch(() => {})
    return () => video?.pause()
  }, [active])

  if (failed) return <UnavailableVideo />

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-black"
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') event.stopPropagation()
      }}
      onKeyUp={(event) => {
        if (event.key !== 'Escape') event.stopPropagation()
      }}
    >
      <video
        ref={ref}
        src={src}
        aria-label={name}
        controls={active}
        tabIndex={active ? 0 : -1}
        playsInline
        preload="metadata"
        className="h-full w-full object-contain"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setFailed(true)}
      />
      {!active && !playing ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-black/70 text-white shadow-lg">
            <Play className="ml-1 size-6 fill-current" aria-hidden="true" />
          </span>
        </div>
      ) : null}
    </div>
  )
}
