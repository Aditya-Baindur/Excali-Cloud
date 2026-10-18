import type { Metadata } from 'next'
import Link from 'next/link'

import { AnalyticsPreferences } from '@/components/analytics/AnalyticsPreferences'

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'ExcaliCloud privacy and analytics preferences.',
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
          <p>ExcaliCloud may use Microsoft Clarity for analytics.</p>

          <p>
            Analytics tools may collect page views, interaction events,
            device/browser information, approximate location, and referrer data.
            This data is used only to improve the site.
          </p>

          <p>Analytics scripts are not loaded for private IP addresses.</p>

          <p>
            Visitors in regions where consent is required can accept or reject
            analytics before it loads. Visitors outside those regions may have
            analytics enabled by default, but a previous disabled choice is
            respected everywhere.
          </p>

          <p>
            Resetting removes your saved choice. The site then applies its
            current region behavior on a future visit.
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
