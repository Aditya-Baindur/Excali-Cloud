import type { VideoJSON } from '@videoflow/core'
import { workerFetch } from '@/lib/api'
import type { Video } from '@/lib/types'

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024

export function videoUrl(boardId: string, videoId: string) {
  return `/api/workspace/boards/${encodeURIComponent(boardId)}/videos/${encodeURIComponent(videoId)}/content`
}

export function videoMimeType(file: File) {
  return (
    file.type ||
    ({ mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg' }[
      file.name.split('.').pop()?.toLowerCase() || ''
    ] ??
      '')
  )
}

export async function uploadBoardVideo(
  boardId: string,
  file: File,
  token: string,
  signal?: AbortSignal
) {
  const mimeType = videoMimeType(file)
  if (!['video/mp4', 'video/webm', 'video/ogg'].includes(mimeType)) {
    throw new Error(
      'Choose an MP4, WebM, or Ogg video for the shared video library.'
    )
  }
  if (!file.size || file.size > MAX_VIDEO_BYTES) {
    throw new Error(
      'The Videos tab supports videos up to 50 MB. Download larger exports instead.'
    )
  }
  const { video } = await workerFetch<{ video: Video }>(
    `/boards/${encodeURIComponent(boardId)}/videos`,
    token,
    {
      method: 'POST',
      headers: {
        'Content-Type': mimeType,
        'X-File-Name': encodeURIComponent(file.name),
      },
      body: file,
      signal,
    }
  )
  return video
}

export function emptyProject(name: string): VideoJSON {
  return {
    name,
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 10,
    backgroundColor: '#000000',
    layers: [],
  }
}

export function readVideoMetadata(source: string, signal?: AbortSignal) {
  return new Promise<{ duration: number; width: number; height: number }>(
    (resolve, reject) => {
      const video = document.createElement('video')
      const cleanup = () => {
        clearTimeout(timeout)
        video.onloadedmetadata = null
        video.onerror = null
        signal?.removeEventListener('abort', abort)
        video.removeAttribute('src')
        video.load()
      }
      const fail = (message: string) => {
        cleanup()
        reject(new Error(message))
      }
      const abort = () => fail('Video loading cancelled.')
      const timeout = setTimeout(
        () => fail('Video loading timed out. Try again.'),
        30_000
      )
      video.preload = 'metadata'
      video.onloadedmetadata = () => {
        const { duration, videoWidth: width, videoHeight: height } = video
        if (!Number.isFinite(duration) || duration <= 0 || !width || !height) {
          fail(
            'This video does not have readable duration or dimensions. Try an MP4 video.'
          )
          return
        }
        cleanup()
        resolve({ duration, width, height })
      }
      video.onerror = () =>
        fail(
          'Could not read this video. It may have been deleted or use an unsupported codec.'
        )
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
      else video.src = source
    }
  )
}

export async function projectFromVideo(
  board: { id: string; name: string },
  video: Video,
  signal?: AbortSignal
): Promise<VideoJSON> {
  const source = videoUrl(board.id, video.id)
  const { duration, width, height } = await readVideoMetadata(source, signal)
  return {
    ...emptyProject(video.name.replace(/\.[^.]+$/, '') + ' — edited'),
    width,
    height,
    duration,
    layers: [
      {
        id: crypto.randomUUID(),
        type: 'video',
        settings: {
          enabled: true,
          source,
          startTime: 0,
          sourceStart: 0,
          sourceDuration: duration,
          mediaDuration: duration,
        },
        properties: {},
        animations: [],
        track: 0,
      },
    ],
  }
}

export function exportFileName(name: string) {
  return `${(name.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').trim() || 'Edited video').slice(0, 240)}.mp4`
}

export async function readAudioDuration(source: string, signal?: AbortSignal) {
  const response = await fetch(source, { signal })
  if (!response.ok) throw new Error('Could not load this audio file.')
  const bytes = await response.arrayBuffer()
  if (signal?.aborted) throw new Error('Audio loading cancelled.')
  const context = new AudioContext()
  try {
    const audio = await context.decodeAudioData(bytes)
    if (!Number.isFinite(audio.duration) || audio.duration <= 0)
      throw new Error('This audio file has no readable duration.')
    return audio.duration
  } finally {
    await context.close()
  }
}
