import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { Button } from '#/components/ui/button'
import { completeLogin } from '#/lib/auth'
import { m } from '#/paraglide/messages'

/**
 * Where an OAuth provider's sign-in sends the user back.
 *
 * This path is on the backend's `redirect_uri_allowlist`; changing it means
 * changing that list too, in `services/trailbase/traildepot/config.textproto`.
 */
export const Route = createFileRoute('/auth/callback')({
  component: CallbackPage,
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === 'string' ? search.code : undefined,
  }),
})

/*
  A code may be spent exactly once, and so may the verifier that unlocks it.
  React runs effects twice on mount in development — a module-level flag keeps
  the guarantee at one exchange per page load, not one per component instance.
*/
let exchangeStarted = false

function CallbackPage() {
  const { code } = Route.useSearch()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!code) {
      setError(m.error_login_failed())
      return
    }
    if (exchangeStarted) return
    exchangeStarted = true

    completeLogin(code)
      .then(() => {
        window.location.replace('/')
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : m.error_login_failed())
      })
  }, [code])

  return (
    <main className="grid h-dvh place-items-center px-4">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        {error ? (
          <>
            <p className="text-destructive">{error}</p>
            <Button variant="outline" onClick={() => window.location.replace('/login')}>
              {m.login_title()}
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground">{m.login_pending()}</p>
        )}
      </div>
    </main>
  )
}
