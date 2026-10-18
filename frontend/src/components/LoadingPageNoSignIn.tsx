'use client'
import { LoaderCircle } from 'lucide-react'

export default function LoadingPageNS() {
  return (
    <div
      role="status"
      className="flex h-dvh items-center justify-center bg-black"
    >
      <div className="flex items-center gap-2 text-sm text-neutral-400">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span>Loading…</span>
      </div>
    </div>
  )
}
