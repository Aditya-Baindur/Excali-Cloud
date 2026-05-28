'use client'

import { useEffect, useRef } from 'react'
import Clarity from '@microsoft/clarity'
import { isLocalAnalyticsHost } from './local-traffic'
import { useAnalyticsConsent } from './store/analytics-consent'

export default function ClarityProvider() {
  const consent = useAnalyticsConsent((s) => s.consent)
  const initialized = useRef(false)

  const projectId =
    process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID ??
    process.env.NEXT_PUBLIC_CLARITY_API_KEY

  useEffect(() => {
    if (!projectId) return
    if (isLocalAnalyticsHost(window.location.hostname)) return

    if (!initialized.current) {
      if (consent !== 'granted') return

      Clarity.init(projectId)
      initialized.current = true
    }

    const storageConsent = consent === 'granted' ? 'granted' : 'denied'

    Clarity.consentV2({
      ad_Storage: storageConsent,
      analytics_Storage: storageConsent,
    })
  }, [consent, projectId])

  return null
}
