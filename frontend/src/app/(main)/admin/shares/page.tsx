'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ExternalLink,
  FilePenLine,
  Link2,
  Link2Off,
  Loader2,
  Search,
  X,
} from 'lucide-react'

import { apiFetch } from '@/lib/api'
import type { Share } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ShareButton } from '@/components/sharing/ShareButton'
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell'
import {
  formatWorkspaceDate,
  WorkspaceError,
  WorkspaceLoading,
  workspaceErrorMessage,
} from '@/components/workspace/WorkspaceStates'

type ShareFilter = 'all' | 'active' | 'revoked'

export default function ManageSharesPage() {
  const [shares, setShares] = useState<Share[]>([])
  const [loading, setLoading] = useState(true)
  const [loadVersion, setLoadVersion] = useState(0)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ShareFilter>('all')
  const [revokeTarget, setRevokeTarget] = useState<Share | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [revokeError, setRevokeError] = useState('')
  const [notice, setNotice] = useState('')
  const revokeTrigger = useRef<HTMLElement | null>(null)
  const pageHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    apiFetch<{ shares: Share[] }>('/shares', { signal: controller.signal })
      .then(({ shares: result }) => setShares(result))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            workspaceErrorMessage(cause, 'Could not load your share links.')
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [loadVersion])

  const activeShares = shares.filter((share) => !share.revokedAt)
  const visibleShares = shares
    .filter(
      (share) =>
        (filter === 'all' ||
          (filter === 'active'
            ? !share.revokedAt
            : Boolean(share.revokedAt))) &&
        `${share.boardName} ${share.token}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
    )
    .sort((a, b) => b.createdAt - a.createdAt)

  function registerShare(share: Share) {
    setShares((current) =>
      current.some((item) => item.id === share.id)
        ? current.map((item) => (item.id === share.id ? share : item))
        : [share, ...current]
    )
  }

  async function revokeShare() {
    if (!revokeTarget || revoking) return
    setRevoking(true)
    setRevokeError('')
    try {
      await apiFetch(`/shares/${encodeURIComponent(revokeTarget.id)}`, {
        method: 'DELETE',
      })
      setShares((current) =>
        current.map((share) =>
          share.id === revokeTarget.id
            ? { ...share, revokedAt: Date.now() }
            : share
        )
      )
      setNotice(`Link revoked for “${revokeTarget.boardName}”.`)
      setRevokeTarget(null)
    } catch (cause) {
      setRevokeError(
        workspaceErrorMessage(
          cause,
          'Could not revoke this link. Please try again.'
        )
      )
    } finally {
      setRevoking(false)
    }
  }

  return (
    <WorkspaceShell section="Manage shares">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1
            ref={pageHeading}
            tabIndex={-1}
            className="text-2xl font-semibold tracking-tight outline-none"
          >
            Manage shares
          </h1>
        </div>
      </div>

      {notice ? (
        <div
          role="status"
          className="mb-5 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
        >
          <Check className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice('')}
            className="rounded p-1 hover:bg-emerald-500/20 focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1" aria-label="Filter shares">
          {(
            [
              ['all', 'All links', shares.length],
              ['active', 'Active', activeShares.length],
              ['revoked', 'Revoked', shares.length - activeShares.length],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                filter === value
                  ? 'bg-white/[0.02] font-medium text-white shadow-sm ring-1 ring-white/10'
                  : 'text-neutral-400 hover:bg-white/[0.04] hover:text-white'
              )}
            >
              {label}
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 text-[10px] leading-none',
                  filter === value
                    ? 'bg-violet-500/10 text-violet-300'
                    : 'bg-white/[0.05] text-neutral-400'
                )}
              >
                {loading ? '–' : count}
              </span>
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search
            className="absolute top-2.5 left-3 size-4 text-neutral-400"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search shared boards or links"
            placeholder="Search boards or links…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.02] pr-3 pl-9 text-sm outline-none placeholder:text-neutral-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
          />
        </div>
      </div>

      {loading ? (
        <WorkspaceLoading label="Loading shares…" />
      ) : error ? (
        <WorkspaceError
          message={error}
          onRetry={() => {
            setError('')
            setLoading(true)
            setLoadVersion((value) => value + 1)
          }}
        />
      ) : visibleShares.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-12 text-center">
          <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400">
            <Link2 className="size-7" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <h2 className="text-lg font-semibold tracking-tight">
            {shares.length === 0 ? 'No shared boards yet' : 'No links to show'}
          </h2>
          {shares.length === 0 ? (
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-neutral-400">
              Share a board to create a public link.
            </p>
          ) : null}
          {shares.length === 0 ? (
            <Button
              asChild
              className="mt-6 bg-violet-600 text-white hover:bg-violet-700"
            >
              <Link href="/dashboard">
                Choose a board <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <Button
              variant="outline"
              className="mt-6 border-white/10 bg-white/[0.02] text-neutral-300 hover:bg-white/[0.04]"
              onClick={() => {
                setQuery('')
                setFilter('all')
              }}
            >
              <X aria-hidden="true" /> Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
          <div className="hidden grid-cols-[minmax(0,1fr)_100px_110px_250px] gap-4 border-b border-white/10 bg-white/[0.02] px-5 py-3 text-[10px] font-medium tracking-wider text-neutral-400 uppercase xl:grid">
            <span>Board / public link</span>
            <span>Status</span>
            <span>Created</span>
            <span className="text-right">Actions</span>
          </div>
          <ul className="divide-y divide-white/10">
            {visibleShares.map((share) => {
              const active = !share.revokedAt
              const currentShare = activeShares.find(
                (item) => item.boardId === share.boardId
              )
              return (
                <li
                  key={share.id}
                  className="grid grid-cols-1 items-center gap-4 px-5 py-5 transition-colors hover:bg-white/[0.04] sm:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1fr)_100px_110px_250px]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-neutral-400 sm:flex">
                      <FilePenLine
                        className="size-[18px]"
                        strokeWidth={1.6}
                        aria-hidden="true"
                      />
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/board/${encodeURIComponent(share.boardId)}`}
                        className="flex items-center gap-1.5 rounded-sm text-sm font-medium text-neutral-200 outline-none hover:text-violet-300 focus-visible:ring-2 focus-visible:ring-violet-500"
                      >
                        <span className="truncate">{share.boardName}</span>
                        <ArrowUpRight
                          className="size-3.5 shrink-0 text-neutral-500"
                          aria-hidden="true"
                        />
                      </Link>
                      <p
                        className="mt-1.5 truncate font-mono text-[10px] text-neutral-400"
                        title={`/share/${share.token}`}
                      >
                        /share/{share.token}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:justify-end xl:justify-start">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium',
                        active
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : 'bg-white/[0.05] text-neutral-400'
                      )}
                    >
                      <span
                        className={cn(
                          'size-1.5 rounded-full',
                          active ? 'bg-emerald-500' : 'bg-neutral-500'
                        )}
                      />
                      {active ? 'Active' : 'Revoked'}
                    </span>
                    <span className="text-[11px] text-neutral-400 xl:hidden">
                      {active ? 'Created' : 'Revoked'}{' '}
                      {formatWorkspaceDate(share.revokedAt || share.createdAt)}
                    </span>
                  </div>
                  <div
                    className="hidden text-xs text-neutral-400 xl:block"
                    title={
                      share.revokedAt
                        ? `Revoked ${formatWorkspaceDate(share.revokedAt)}`
                        : undefined
                    }
                  >
                    {formatWorkspaceDate(share.createdAt)}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:col-span-2 sm:justify-end xl:col-span-1">
                    {active ? (
                      <>
                        <ShareButton
                          boardId={share.boardId}
                          existingShare={share}
                          label="Copy link"
                          compact
                        />
                        <Button
                          asChild
                          variant="ghost"
                          size="icon-sm"
                          className="text-neutral-400 hover:bg-violet-500/10 hover:text-violet-300"
                        >
                          <a
                            href={`/share/${share.token}`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open public link for ${share.boardName}`}
                            title="Preview public link"
                          >
                            <ExternalLink
                              className="size-3.5"
                              aria-hidden="true"
                            />
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(event) => {
                            revokeTrigger.current = event.currentTarget
                            setRevokeTarget(share)
                            setRevokeError('')
                          }}
                          className="text-neutral-400 hover:bg-red-500/10 hover:text-red-300"
                        >
                          <Link2Off className="size-3.5" aria-hidden="true" />{' '}
                          Revoke
                        </Button>
                      </>
                    ) : currentShare ? (
                      <ShareButton
                        boardId={share.boardId}
                        existingShare={currentShare}
                        label="Copy current link"
                        compact
                      />
                    ) : (
                      <ShareButton
                        boardId={share.boardId}
                        label="Create new link"
                        compact
                        onShared={registerShare}
                      />
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <Dialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open && !revoking) setRevokeTarget(null)
        }}
      >
        <DialogContent
          className="dark rounded-xl border-white/10 bg-neutral-950 text-white"
          showCloseButton={!revoking}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (revokeTrigger.current?.isConnected)
              revokeTrigger.current.focus()
            else pageHeading.current?.focus()
          }}
        >
          <DialogHeader>
            <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
              <Link2Off className="size-5" aria-hidden="true" />
            </span>
            <DialogTitle>Revoke link?</DialogTitle>
            <DialogDescription className="pt-1 leading-relaxed text-neutral-400">
              This link to “{revokeTarget?.boardName}” will stop working
              immediately. Previously saved copies are unaffected.
            </DialogDescription>
          </DialogHeader>
          {revokeError ? <WorkspaceError message={revokeError} /> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => setRevokeTarget(null)}
              disabled={revoking}
              className="text-neutral-300 hover:bg-white/[0.05]"
            >
              Cancel
            </Button>
            <Button
              onClick={revokeShare}
              disabled={revoking}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {revoking ? (
                <Loader2
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Link2Off aria-hidden="true" />
              )}
              {revoking ? 'Revoking…' : 'Revoke link'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </WorkspaceShell>
  )
}
