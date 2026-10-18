'use client'

import { useEffect } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'

export default function LoadingPage() {
  const { isLoaded, isSignedIn } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in')
    }
  }, [isLoaded, isSignedIn, router])

  if (!isLoaded) {
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

  return null
}
