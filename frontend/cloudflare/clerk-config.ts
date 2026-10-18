import { env } from 'cloudflare:workers'

export function getClerkConfig() {
  return {
    publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  }
}
