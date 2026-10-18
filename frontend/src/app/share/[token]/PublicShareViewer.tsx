'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowLeft, Link2Off, Loader2, RefreshCw } from 'lucide-react'
import { ApiError, apiFetch } from '@/lib/api'
import type { Board, Video } from '@/lib/types'
import type { SharedScene } from './PublicCanvas'

const PublicCanvas = dynamic(() => import('./PublicCanvas'), {
  ssr: false,
  loading: () => <LoadingCanvas />,
})

type PublicShare = {
  board: Pick<Board, 'id' | 'name' | 'updatedAt'>
  scene: SharedScene
  videos: Video[]
}

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; data: PublicShare }
  | { status: 'error'; unavailable: boolean }

function LoadingCanvas() {
  return (
    <div
      role="status"
      className="flex h-full min-h-80 items-center justify-center gap-3 bg-neutral-950 text-sm text-neutral-400"
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      Loading board…
    </div>
  )
}

export default function PublicShareViewer({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    apiFetch<PublicShare>(`/public/shares/${encodeURIComponent(token)}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: 'loaded', data })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const status = error instanceof ApiError ? error.status : undefined
        setState({
          status: 'error',
          unavailable: status === 404 || status === 410,
        })
      })

    return () => controller.abort()
  }, [token, attempt])

  return (
    <main className="dark flex h-dvh flex-col overflow-hidden bg-neutral-950 text-white">
      {state.status === 'loading' ? <LoadingCanvas /> : null}

      {state.status === 'error' ? (
        <div className="flex flex-1 items-center justify-center px-6 py-16">
          <div role="alert" className="max-w-sm text-center">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-neutral-950 text-neutral-500">
              <Link2Off className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">
              {state.unavailable
                ? 'Link unavailable'
                : 'Couldn’t open this board'}
            </h2>
            <p className="mt-3 text-sm leading-6 text-neutral-400">
              {state.unavailable
                ? 'Ask the owner for a new link.'
                : 'Check your connection and try again.'}
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-neutral-950 px-4 py-2.5 text-sm font-medium text-neutral-300 hover:bg-white/5"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Home
              </Link>
              <button
                type="button"
                onClick={() => {
                  setState({ status: 'loading' })
                  setAttempt((current) => current + 1)
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Retry
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {state.status === 'loaded' ? (
        <section
          aria-label="Shared board canvas"
          className="h-full min-h-0 w-full bg-white"
        >
          <h1 className="sr-only">{state.data.board.name}</h1>
          <PublicCanvas
            scene={state.data.scene}
            name={state.data.board.name}
            boardId={state.data.board.id}
            token={token}
            videos={state.data.videos}
          />
        </section>
      ) : null}
    </main>
  )
}
