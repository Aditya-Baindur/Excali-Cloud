export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers)
  if (typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(`/api/workspace${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  })
  return readResponse<T>(response)
}

/** Direct authenticated writes keep large image scenes outside frontend body limits. */
export async function workerFetch<T>(
  path: string,
  token: string,
  init: RequestInit
): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_BASE
  if (!base) throw new Error('The board service is not configured.')
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (typeof init.body === 'string')
    headers.set('Content-Type', 'application/json')
  const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    ...init,
    headers,
  })
  return readResponse<T>(response)
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : undefined
    throw new ApiError(
      message ||
        (response.status === 401
          ? 'Please sign in again to continue.'
          : 'Something went wrong. Please try again.'),
      response.status
    )
  }
  return response.json() as Promise<T>
}
