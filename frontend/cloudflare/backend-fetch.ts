import { apiFetch } from './api'

export function backendFetch(path: string, request: Request, init: RequestInit) {
  // Fetch-only options such as Next's cache/duplex settings do not apply to
  // an in-process Worker call (and are not all accepted by workerd's Request).
  return apiFetch(new Request(new URL(path, request.url), {
    method: init.method,
    headers: init.headers,
    body: init.body,
  }))
}
