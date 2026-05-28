import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'
import AnalyticsConsentProvider from '../components/analytics/AnalyticsConsent'
import { AnalyticsToggle } from '../components/analytics/AnalyticsToggle'
import ClarityProvider from '../components/analytics/ClarityConsent'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'EXCALI-CLOUD',
  description: 'Collaborative whiteboard powered by Cloudflare',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} bg-black text-white antialiased`}
        >
          <AnalyticsConsentProvider>
            {children}

            <ClarityProvider />
            <AnalyticsToggle />
          </AnalyticsConsentProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
