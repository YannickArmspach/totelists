/**
 * Custom server entry: every request runs inside Paraglide's middleware, which
 * resolves the locale (cookie → Accept-Language → base) before SSR renders a
 * single string. That is what keeps server and client markup in the same
 * language, cookie strategy doing the persisting.
 */
import { paraglideMiddleware } from './paraglide/server.js'
import handler from '@tanstack/react-start/server-entry'

export default {
  fetch(req: Request): Promise<Response> {
    return paraglideMiddleware(req, ({ request }) => handler.fetch(request))
  },
}
