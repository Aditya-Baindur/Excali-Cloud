'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { SignOutButton } from '@clerk/nextjs'

export default function PricingPage() {
  return (
    <main className="bg-terminal text-terminal-foreground relative min-h-dvh w-full overflow-hidden font-mono">
      {/* terminal grid */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]">
        <div
          className="h-full w-full"
          style={{
            backgroundImage:
              'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
      </div>

      {/* content */}
      <div className="relative z-10 flex min-h-dvh items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 24, filter: 'blur(12px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          className="flex flex-col items-center gap-6 text-center"
        >
          <p className="text-terminal-muted">{'> Session active'}</p>

          <SignOutButton redirectUrl="/">
            <button className="border-terminal-border bg-terminal-widget hover:bg-terminal-widget/80 rounded-md border px-5 py-2 text-sm transition">
              Sign out
            </button>
          </SignOutButton>

          <Link
            href="/dashboard"
            className="text-terminal-muted text-xs underline-offset-4 hover:underline"
          >
            return to dashboard
          </Link>
        </motion.div>
      </div>
    </main>
  )
}
