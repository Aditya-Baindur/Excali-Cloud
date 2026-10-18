import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

// An inert identifier, never a playback URL. Private credentials and public
// share tokens belong to the current viewer, not to a saved drawing.
const VIDEO_LINK_PREFIX = 'https://board-video.invalid/'
const ID = /^[a-zA-Z0-9_-]+$/

export function canvasVideoLink(boardId: string, videoId: string) {
  return `${VIDEO_LINK_PREFIX}${boardId}/${videoId}`
}

export function validateCanvasVideoLink(link: string): true | undefined {
  return /^https:\/\/board-video\.invalid\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(
    link
  )
    ? true
    : undefined
}

export function isCanvasVideoLink(link: string | null | undefined) {
  return !!link?.startsWith(VIDEO_LINK_PREFIX)
}

export function getCanvasVideo(element: ExcalidrawElement, boardId: string) {
  const data = element.customData
  if (
    element.type !== 'embeddable' ||
    data?.type !== 'board-video' ||
    data.boardId !== boardId ||
    typeof data.videoId !== 'string' ||
    !ID.test(boardId) ||
    !ID.test(data.videoId) ||
    element.link !== canvasVideoLink(boardId, data.videoId)
  )
    return null
  return {
    id: data.videoId,
    name: typeof data.name === 'string' ? data.name : 'Video',
  }
}

export function readVideoDimensions(
  src: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const finish = () => {
      clearTimeout(timeout)
      const dimensions = {
        width: video.videoWidth || 640,
        height: video.videoHeight || 360,
      }
      video.onloadedmetadata = null
      video.onerror = null
      video.removeAttribute('src')
      video.load()
      resolve(dimensions)
    }
    const timeout = setTimeout(finish, 5000)
    video.preload = 'metadata'
    video.onloadedmetadata = finish
    video.onerror = finish
    video.src = src
  })
}
