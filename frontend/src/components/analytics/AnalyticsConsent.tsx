'use client'

import { useEffect } from 'react'
import { useAnalyticsConsent } from './store/analytics-consent'

export default function AnalyticsConsentProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const hydrate = useAnalyticsConsent((s) => s.hydrate)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  return <>{children}</>
}
