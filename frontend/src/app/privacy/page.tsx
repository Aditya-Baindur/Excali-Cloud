import type { Metadata } from 'next'
import Link from 'next/link'

import { AnalyticsPreferences } from '@/components/analytics/AnalyticsPreferences'

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'Privacy information for the Aditya Baindur personal portfolio.',
  alternates: {
    canonical: '/privacy',
  },
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-black px-6 py-16 text-white">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-300 hover:underline"
        >
          Back
        </Link>

        <h1 className="mt-10 text-4xl font-medium tracking-tight">Privacy</h1>

        <div className="mt-8 space-y-5 text-sm leading-6 text-zinc-300">
          <p>
            This is a excalidraw. It may use Microsoft Clarity to understand
            site usage and improve the site.
          </p>

          <p>
            Analytics tools may collect page views, interaction events,
            device/browser information, approximate location, and referrer data.
            Analytics is used only to understand how the site is used and where
            it can be improved.
          </p>

          <p>Analytics scripts are not loaded for private IP addresses.</p>

          <p>
            Visitors in regions where consent is required can accept or reject
            analytics before it loads. Visitors outside those regions may have
            analytics enabled by default, but a previous disabled choice is
            respected everywhere.
          </p>

          <p>
            You can allow analytics, disable analytics, or reset your saved
            choice below. Resetting removes your saved choice so the site can
            apply the current region behavior again on a future visit.
          </p>

          <p>
            Contact:{' '}
            <a
              href="mailto:aditya@adityabaindur.dev"
              className="text-white underline underline-offset-4 hover:text-zinc-300"
            >
              aditya@adityabaindur.dev
            </a>
          </p>
        </div>

        <AnalyticsPreferences />
      </div>
    </main>
  )
}
