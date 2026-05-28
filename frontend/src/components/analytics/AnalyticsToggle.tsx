'use client'

import { useEffect, useState } from 'react'
import { useAnalyticsConsent } from './store/analytics-consent'

export function AnalyticsToggle() {
  const { consent, region, setConsent } = useAnalyticsConsent()
  const [visible, setVisible] = useState(false)

  const useAnalytics = process.env.NEXT_PUBLIC_USE_ANALYTICS ?? 'true'
  const analyticsEnabled = useAnalytics !== 'false'

  useEffect(() => {
    setVisible(
      analyticsEnabled && region === 'required' && consent === 'unknown'
    )
  }, [analyticsEnabled, consent, region])

  if (!visible) return null

  return (
    <aside
      aria-live="polite"
      className="fixed right-4 bottom-4 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-xl border border-zinc-300 bg-white p-4 text-zinc-900 shadow-xl"
    >
      <p className="text-sm">
        Help improve this site with privacy-friendly analytics?
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          onClick={() => setConsent('denied')}
        >
          No thanks
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-sm text-white"
          onClick={() => setConsent('granted')}
        >
          Allow
        </button>
      </div>
    </aside>
  )
}
