import app from 'vinext/server/app-router-entry'
import { apiFetch } from './api'

// Large scene/video requests go straight to the API, without a second HTTP hop.
export default {
  fetch(request, bindings, context) {
    const url = new URL(request.url)
    if (url.pathname === '/api/worker' || url.pathname.startsWith('/api/worker/')) {
      url.pathname = url.pathname.slice('/api/worker'.length) || '/'
      return apiFetch(new Request(url, request))
    }
    return app.fetch(request, bindings, context)
  },
} satisfies ExportedHandler<CloudflareAppEnv>
