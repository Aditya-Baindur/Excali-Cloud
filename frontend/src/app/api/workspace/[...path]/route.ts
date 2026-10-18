import { auth } from '@clerk/nextjs/server'
import type { NextRequest } from 'next/server'
import { backendFetch } from '@/lib/backend-fetch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ path: string[] }> }

async function forward(request: NextRequest, context: Context) {
  const { path } = await context.params
  // Only known API roots are forwarded, and segments cannot change the target origin.
  if (
    !path.length ||
    path.some((segment) => !/^[a-zA-Z0-9_-]+$/.test(segment))
  ) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  const resource = `/${path.join('/')}`
  const publicRead =
    /^\/public\/shares\/[^/]+(?:\/videos\/[^/]+\/content)?$/.test(resource)
  if (publicRead && !['GET', 'HEAD'].includes(request.method)) {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }
  if (!publicRead && !['boards', 'shares', 'folders'].includes(path[0])) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // Preserve byte ranges and Content-Length when forwarding the response stream.
  const headers = new Headers({ 'Accept-Encoding': 'identity' })
  if (!publicRead) {
    const session = await auth()
    if (!session.userId)
      return Response.json(
        { error: 'Please sign in to continue.' },
        { status: 401 }
      )
    // Cookie-authenticated mutations must originate from this application.
    const origin = request.headers.get('origin')
    if (
      !['GET', 'HEAD'].includes(request.method) &&
      origin &&
      origin !== request.nextUrl.origin
    ) {
      return Response.json({ error: 'Invalid request origin' }, { status: 403 })
    }
    const token = await session.getToken()
    if (!token)
      return Response.json(
        { error: 'Your session has expired. Please sign in again.' },
        { status: 401 }
      )
    headers.set('Authorization', `Bearer ${token}`)
  }

  for (const name of ['content-type', 'range', 'if-range', 'x-file-name']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  try {
    const hasBody = !['GET', 'HEAD'].includes(request.method)
    const init: RequestInit & { duplex?: 'half' } = {
      method: request.method,
      headers,
      cache: 'no-store',
      redirect: 'error',
      signal: request.signal,
      ...(hasBody ? { body: request.body, duplex: 'half' as const } : {}),
    }
    const response = await backendFetch(resource, request, init)
    const outgoing = new Headers({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    for (const name of [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'etag',
      'content-disposition',
    ]) {
      const value = response.headers.get(name)
      if (value) outgoing.set(name, value)
    }
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    })
  } catch {
    return Response.json(
      { error: 'The board service is unavailable. Please try again.' },
      { status: 502 }
    )
  }
}

export {
  forward as GET,
  forward as HEAD,
  forward as POST,
  forward as PUT,
  forward as DELETE,
}
