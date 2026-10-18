'use client'

import Link from 'next/link'
import { useAnalyticsConsent } from './store/analytics-consent'

export function AnalyticsToggle() {
  const { consent, region, setConsent } = useAnalyticsConsent()

  const useAnalytics = process.env.NEXT_PUBLIC_USE_ANALYTICS ?? 'true'
  const analyticsEnabled = useAnalytics !== 'false'

  const visible =
    analyticsEnabled && region === 'required' && consent === 'unknown'

  if (!visible) return null

  return (
    <aside
      aria-live="polite"
      className="fixed right-4 bottom-4 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-xl border border-white/10 bg-neutral-950 p-4 text-white shadow-xl"
    >
      <p className="text-sm">Allow analytics to help improve ExcaliCloud?</p>
      <div className="mt-3 flex items-center gap-2">
        <Link
          href="/privacy"
          className="mr-auto text-xs text-neutral-400 hover:text-white"
        >
          Privacy
        </Link>
        <button
          type="button"
          className="rounded-lg border border-white/15 px-3 py-1.5 text-sm hover:bg-white/5"
          onClick={() => setConsent('denied')}
        >
          No thanks
        </button>
        <button
          type="button"
          className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white hover:bg-violet-500"
          onClick={() => setConsent('granted')}
        >
          Allow
        </button>
      </div>
    </aside>
  )
}
