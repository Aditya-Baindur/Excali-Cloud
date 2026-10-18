/** Cloudflare substitutes a binding-backed implementation at build time. */
export function getClerkConfig() {
  return {
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  }
}
