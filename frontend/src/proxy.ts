import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getClerkConfig } from '@/lib/clerk-config'

const isPublicRoute = createRouteMatcher([
  '/',
  '/privacy',
  '/draw(.*)',
  '/sign-in(.*)',
  '/public(.*)',
  '/share(.*)',
  '/api/workspace(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth()
  const url = req.nextUrl

  if (!isPublicRoute(req)) {
    await auth.protect()
  }

  if (userId && url.pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  if (userId && url.pathname.startsWith('/sign-in')) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }
}, () => getClerkConfig())

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|png|jpg|jpeg|gif|svg|woff2?|ico)).*)',
    '/(api|trpc)(.*)',
  ],
}
