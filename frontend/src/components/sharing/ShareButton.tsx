'use client'

import { useId, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Copy, ExternalLink, Link2, Loader2 } from 'lucide-react'

import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Share } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { workspaceErrorMessage } from '@/components/workspace/WorkspaceStates'

export function ShareButton({
  boardId,
  beforeShare,
  onShared,
  compact = false,
  className,
  label = 'Share',
  existingShare,
}: {
  boardId: string
  beforeShare?: () => Promise<void>
  onShared?: (share: Share) => void
  compact?: boolean
  className?: string
  label?: string
  existingShare?: Share
}) {
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [error, setError] = useState('')
  const linkInput = useRef<HTMLInputElement>(null)
  const shareTrigger = useRef<HTMLButtonElement>(null)
  const linkInputId = useId()

  async function copyLink(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setCopyFailed(false)
    } catch {
      setCopied(false)
      setCopyFailed(true)
      linkInput.current?.focus()
      linkInput.current?.select()
    }
  }

  async function shareBoard() {
    if (busy) return
    setBusy(true)
    setError('')
    setCopied(false)
    setCopyFailed(false)
    setUrl('')
    try {
      await beforeShare?.()
      const share =
        existingShare ??
        (
          await apiFetch<{ share: Share }>(
            `/boards/${encodeURIComponent(boardId)}/share`,
            { method: 'POST' }
          )
        ).share
      const shareUrl = `${window.location.origin}/share/${share.token}`
      setUrl(shareUrl)
      onShared?.(share)
      setOpen(true)
      await copyLink(shareUrl)
    } catch (cause) {
      setError(workspaceErrorMessage(cause, 'Could not create a share link.'))
      setOpen(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        ref={shareTrigger}
        variant="outline"
        size={compact ? 'sm' : 'default'}
        className={cn(
          'border-white/10 bg-white/[0.02] text-neutral-300 shadow-none hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-violet-300',
          className
        )}
        onClick={shareBoard}
        disabled={busy}
        title={
          existingShare
            ? 'Copy this public, view-only link'
            : 'Create and copy a public, view-only link'
        }
        aria-label={
          busy ? 'Preparing share link' : `${label} board with a public link`
        }
      >
        {busy ? (
          <Loader2
            className="animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : (
          <Link2 aria-hidden="true" />
        )}
        {busy ? (existingShare ? 'Copying…' : 'Sharing…') : label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          data-prevent-outside-click
          className="Dialog dark rounded-xl border-white/10 bg-neutral-950 text-white"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            shareTrigger.current?.focus()
          }}
        >
          <DialogHeader>
            <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
              <Link2 className="size-5" aria-hidden="true" />
            </span>
            <DialogTitle>
              {url ? 'Share board' : 'Could not share board'}
            </DialogTitle>
            <DialogDescription
              className={
                url ? 'pt-1 leading-relaxed text-neutral-400' : 'sr-only'
              }
            >
              Anyone with the link can view the latest saved board and videos.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300"
            >
              {error}
            </p>
          ) : null}
          {url ? (
            <>
              <div>
                <label
                  htmlFor={linkInputId}
                  className="mb-2 block text-xs font-medium text-neutral-300"
                >
                  Public link
                </label>
                <div className="flex gap-2">
                  <input
                    ref={linkInput}
                    id={linkInputId}
                    value={url}
                    readOnly
                    onFocus={(event) => event.target.select()}
                    className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-neutral-300 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
                  />
                  <Button
                    onClick={() => copyLink(url)}
                    className="h-10 bg-violet-600 text-white hover:bg-violet-700"
                  >
                    {copied ? (
                      <Check aria-hidden="true" />
                    ) : (
                      <Copy aria-hidden="true" />
                    )}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <p
                  role="status"
                  className={
                    copyFailed ? 'mt-2 text-xs text-neutral-400' : 'sr-only'
                  }
                >
                  {copied
                    ? 'Link copied.'
                    : copyFailed
                      ? 'Select and copy the link manually.'
                      : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs">
                <Link
                  href="/admin/shares"
                  className="font-medium text-neutral-400 hover:text-violet-300"
                >
                  Manage shares
                </Link>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-violet-300 hover:underline"
                >
                  Open link{' '}
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              </div>
            </>
          ) : (
            <Button
              onClick={shareBoard}
              disabled={busy}
              className="bg-violet-600 text-white hover:bg-violet-700"
            >
              Retry
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

export default ShareButton
