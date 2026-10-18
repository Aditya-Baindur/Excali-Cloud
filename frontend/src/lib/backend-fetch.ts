/** The separate-host deployment forwards to its configured API Worker. */
export function backendFetch(path: string, _request: Request, init: RequestInit) {
  const base = process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE
  if (!base) {
    return Promise.resolve(Response.json(
      { error: 'The board service is not configured.' },
      { status: 503 }
    ))
  }
  return fetch(`${base.replace(/\/$/, '')}${path}`, init)
}
