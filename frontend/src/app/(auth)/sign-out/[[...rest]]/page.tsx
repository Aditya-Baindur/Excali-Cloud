'use client'

import Link from 'next/link'
import { SignOutButton } from '@clerk/nextjs'

export default function SignOutPage() {
  return (
    <main className="dark flex min-h-dvh items-center justify-center bg-neutral-950 px-6 text-white">
      <div className="flex flex-col items-center gap-5">
        <SignOutButton redirectUrl="/">
          <button className="rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 text-sm hover:bg-white/10">
            Sign out
          </button>
        </SignOutButton>
        <Link
          href="/dashboard"
          className="text-sm text-neutral-400 hover:text-white"
        >
          Back to boards
        </Link>
      </div>
    </main>
  )
}
