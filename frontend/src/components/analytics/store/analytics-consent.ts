import { create } from 'zustand'

import { isLocalAnalyticsHost } from '../local-traffic'

export type ConsentState = 'unknown' | 'granted' | 'denied'
export type ConsentRegion = 'unknown' | 'required' | 'not-required'
export type DetectedRegion = {
  country: string | null
  colo: string | null
  city: string | null
}

type AnalyticsConsentStore = {
  consent: ConsentState
  region: ConsentRegion
  detectedRegion: DetectedRegion | null
  setConsent: (value: ConsentState) => void
  hydrate: () => void
}

const STORAGE_KEY = 'analytics-consent'
const STORAGE_SOURCE_KEY = 'analytics-consent-source'
const EXPLICIT_CONSENT_SOURCE = 'explicit'
const REGION_COOKIE_KEY = 'analytics-consent-region'
const DEFAULT_REGION_ENDPOINT = 'https://region.vicilabs.dev/api/region'
const REQUIRE_CONSENT_FOR_ALL_COUNTRIES = process.env.NEXT_PUBLIC_ANALYTICS_ALL_COUNTRIES === 'true'

const CONSENT_REQUIRED_COUNTRIES = new Set([
  'AT',
  'BE',
  'BG',
  'CH',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GB',
  'GR',
  'HR',
  'HU',
  'IE',
  'IS',
  'IT',
  'LI',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'NO',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
])

type ResolvedRegion = {
  consentRegion: ConsentRegion
  detectedRegion: DetectedRegion
}

let regionRequest: Promise<ResolvedRegion | null> | null = null

function readConsentRegion(): ConsentRegion {
  if (typeof document === 'undefined') return 'unknown'

  const cookie = document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${REGION_COOKIE_KEY}=`))

  const value = cookie?.split('=')[1]

  if (value === 'required' || value === 'not-required') return value

  return 'unknown'
}

function readStoredConsent(): ConsentState | null {
  const stored = localStorage.getItem(STORAGE_KEY)

  if (stored === 'denied') {
    localStorage.setItem(STORAGE_SOURCE_KEY, EXPLICIT_CONSENT_SOURCE)
    return stored
  }

  if (stored === 'granted') {
    if (localStorage.getItem(STORAGE_SOURCE_KEY) === EXPLICIT_CONSENT_SOURCE) {
      return stored
    }

    localStorage.removeItem(STORAGE_KEY)
  }

  return null
}

function cleanString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getConsentRegionFromCountry(country: string | null): ConsentRegion {
  if (REQUIRE_CONSENT_FOR_ALL_COUNTRIES) return 'required'

  if (!country || country === 'XX' || country === 'T1') return 'not-required'

  return CONSENT_REQUIRED_COUNTRIES.has(country) ? 'required' : 'not-required'
}

function parseDetectedRegion(value: unknown): ResolvedRegion | null {
  if (!value || typeof value !== 'object') return null

  const region = value as Record<string, unknown>
  const country = cleanString(region.country)?.toUpperCase() ?? null

  if (!country) return null

  const detectedRegion = {
    country,
    colo: cleanString(region.colo)?.toUpperCase() ?? null,
    city: cleanString(region.city),
  }

  return {
    consentRegion: getConsentRegionFromCountry(country),
    detectedRegion,
  }
}

function getRegionEndpoint() {
  const configuredEndpoint = process.env.NEXT_PUBLIC_ANALYTICS_REGION_ENDPOINT

  if (configuredEndpoint) return configuredEndpoint

  return DEFAULT_REGION_ENDPOINT
}

function resolveRegion() {
  regionRequest ??= fetch(getRegionEndpoint(), {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
    },
  })
    .then((response) => (response.ok ? response.json() : null))
    .then(parseDetectedRegion)
    .catch(() => null)

  return regionRequest
}

function dispatchConsentChange() {
  window.dispatchEvent(new Event('analytics-consent-change'))
}

export const useAnalyticsConsent = create<AnalyticsConsentStore>(
  (set, get) => ({
    consent: 'unknown',
    region: 'unknown',
    detectedRegion: null,

    setConsent: (value) => {
      if (typeof window === 'undefined') return

      try {
        if (value === 'unknown') {
          localStorage.removeItem(STORAGE_KEY)
          localStorage.removeItem(STORAGE_SOURCE_KEY)
        } else {
          localStorage.setItem(STORAGE_KEY, value)
          localStorage.setItem(STORAGE_SOURCE_KEY, EXPLICIT_CONSENT_SOURCE)
        }

        set({ consent: value })
        dispatchConsentChange()
      } catch {
        set({ consent: value })
      }
    },

    hydrate: () => {
      if (typeof window === 'undefined') return

      try {
        const cookieRegion = REQUIRE_CONSENT_FOR_ALL_COUNTRIES
          ? 'required'
          : readConsentRegion()
        const stored = readStoredConsent()

        set({
          consent: stored ?? 'unknown',
          region: 'unknown',
          detectedRegion: null,
        })

        const applyRegion = (
          region: ConsentRegion,
          detectedRegion: DetectedRegion | null
        ) => {
          const currentConsent = readStoredConsent() ?? get().consent

          if (currentConsent === 'granted' || currentConsent === 'denied') {
            set({ consent: currentConsent, region, detectedRegion })
            return
          }

          if (isLocalAnalyticsHost(window.location.hostname)) {
            set({ consent: 'unknown', region, detectedRegion })
            return
          }

          if (region === 'not-required') {
            set({ consent: 'granted', region, detectedRegion })
            dispatchConsentChange()
            return
          }

          set({ consent: 'unknown', region, detectedRegion })
        }

        void resolveRegion().then((resolvedRegion) => {
          if (resolvedRegion) {
            applyRegion(
              resolvedRegion.consentRegion,
              resolvedRegion.detectedRegion
            )
            return
          }

          applyRegion(cookieRegion, null)
        })
      } catch {
        set({ consent: 'unknown' })
      }
    },
  })
)
