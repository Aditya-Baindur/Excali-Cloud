'use client'

import { useEffect } from 'react'
import { useAnalyticsConsent } from './store/analytics-consent'

const consentLabels = {
  unknown: 'No choice saved',
  granted: 'Allowed',
  denied: 'Disabled',
}

const regionLabels = {
  unknown: '',
  required: 'Analytics requires your consent.',
  'not-required': 'Analytics may be enabled by default.',
}

export function AnalyticsPreferences() {
  const { consent, region, setConsent, hydrate } = useAnalyticsConsent()

  useEffect(() => {
    hydrate()
  }, [hydrate])

  return (
    <section
      aria-labelledby="analytics-preferences"
      className="mt-10 rounded-xl border border-white/10 bg-neutral-950 p-5"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="analytics-preferences" className="font-medium text-white">
          Analytics
        </h2>
        <span role="status" className="text-sm text-neutral-400">
          {consentLabels[consent]}
        </span>
      </div>
      {regionLabels[region] ? (
        <p className="mt-2 text-sm text-neutral-400">{regionLabels[region]}</p>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg bg-violet-600 px-3 py-2 text-sm text-white hover:bg-violet-500"
          onClick={() => setConsent('granted')}
        >
          Allow analytics
        </button>
        <button
          type="button"
          className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/5"
          onClick={() => setConsent('denied')}
        >
          Disable analytics
        </button>
        <button
          type="button"
          className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white hover:bg-white/5"
          onClick={() => setConsent('unknown')}
        >
          Reset choice
        </button>
      </div>
    </section>
  )
}
