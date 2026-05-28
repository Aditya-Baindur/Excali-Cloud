'use client'

import { useEffect } from 'react'
import {
  type DetectedRegion,
  useAnalyticsConsent,
} from './store/analytics-consent'

const consentLabels = {
  unknown: 'No choice saved',
  granted: 'Allowed',
  denied: 'Disabled',
}

const regionLabels = {
  unknown: 'Region not detected yet',
  required: 'Consent is required before analytics can load',
  'not-required': 'Analytics may be enabled by default',
}

function formatDetectedRegion(region: DetectedRegion | null) {
  if (!region?.country) return 'Region not detected yet'

  const details = [region.city, region.colo].filter(Boolean)

  if (!details.length) return region.country

  return `${region.country} (${details.join(', ')})`
}

export function AnalyticsPreferences() {
  const { consent, region, detectedRegion, setConsent, hydrate } =
    useAnalyticsConsent()

  useEffect(() => {
    hydrate()
  }, [hydrate])

  return (
    <section
      aria-labelledby="analytics-preferences"
      className="mt-10 rounded-lg border border-zinc-300 bg-white p-5"
    >
      <h2
        id="analytics-preferences"
        className="text-lg font-medium text-zinc-900"
      >
        Analytics Preferences
      </h2>

      <div className="mt-4 space-y-2 text-sm text-zinc-700">
        <p>
          Current analytics choice:{' '}
          <span className="font-medium text-zinc-900">
            {consentLabels[consent]}
          </span>
        </p>
        <p>
          Region behavior:{' '}
          <span className="font-medium text-zinc-900">
            {regionLabels[region]}
          </span>
        </p>
        <p>
          Detected region:{' '}
          <span className="font-medium text-zinc-900">
            {formatDetectedRegion(detectedRegion)}
          </span>
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-sm text-white"
          onClick={() => setConsent('granted')}
        >
          Allow analytics
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          onClick={() => setConsent('denied')}
        >
          Disable analytics
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          onClick={() => setConsent('unknown')}
        >
          Reset choice
        </button>
      </div>
    </section>
  )
}
