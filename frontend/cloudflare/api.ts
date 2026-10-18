import { env } from 'cloudflare:workers'
import backend from '../../excali-cloud/src/index'

export function apiFetch(request: Request) {
  const bindings = env
  const key = bindings.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  let issuer = ''
  try {
    const host = atob(key.replace(/^pk_(test|live)_/, '')).replace(/\$$/, '')
    if (/^[a-zA-Z0-9.-]+$/.test(host)) issuer = `https://${host}`
  } catch {
    // Missing/invalid Clerk configuration fails closed in the API verifier.
  }
  return backend.fetch(request, {
    ...bindings,
    CLERK_ISSUER: issuer,
    CLERK_AUTHORIZED_PARTIES: new URL(request.url).origin,
  })
}
