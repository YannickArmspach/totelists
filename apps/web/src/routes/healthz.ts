/**
 * What the deployment platform probes to decide the app is alive.
 *
 * Deliberately says nothing and checks nothing: a health endpoint is the
 * most-requested and least-authenticated route on the box, and TrailBase or
 * the AI services being down is not a reason to stop serving the app shell.
 */
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/healthz')({
  server: {
    handlers: {
      GET: () => Response.json({ status: 'ok' }),
    },
  },
})
