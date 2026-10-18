import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { getClerkConfig } from '@/lib/clerk-config'
import './globals.css'
import AnalyticsConsentProvider from '../components/analytics/AnalyticsConsent'
import { AnalyticsToggle } from '../components/analytics/AnalyticsToggle'
import ClarityProvider from '../components/analytics/ClarityConsent'
import { BoardNavigationProvider } from '@/components/workspace/BoardCommandMenu'

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
    <ClerkProvider publishableKey={getClerkConfig().publishableKey}>
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} bg-black text-white antialiased`}
        >
          <AnalyticsConsentProvider>
            <BoardNavigationProvider>{children}</BoardNavigationProvider>

            <ClarityProvider />
            <AnalyticsToggle />
          </AnalyticsConsentProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
