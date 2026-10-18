import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function WorkspaceError({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
    >
      <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
      <p className="flex-1">{message}</p>
      {onRetry ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRetry}
          className="text-red-300 hover:bg-red-500/20 hover:text-red-200"
        >
          Retry <ArrowRight aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
}

export function WorkspaceLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex min-h-64 items-center justify-center gap-2 text-sm text-neutral-400"
    >
      <Loader2
        className="size-4 animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      {label}
    </div>
  )
}

export function formatWorkspaceDate(value: number) {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function workspaceErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}
