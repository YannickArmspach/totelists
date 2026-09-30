/**
 * The invite-link landing. The tote may be invisible until the join succeeds
 * (private totes are unreadable pre-membership), so the flow is insert-blind:
 * write a membership row carrying the code and let the CREATE access rule be
 * the judge. Success → the tote becomes readable; failure → bad/revoked link.
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { useHydrated } from '#/db/hooks'
import { client, currentUserId } from '#/lib/auth'
import { newId } from '#/db/ids'
import { useActiveTote } from '#/stores/active-tote'
import { fromUrlId, toUrlId } from '#/lib/url-id'
import { Button } from '#/components/ui/button'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/join/$toteId/$code')({
  component: JoinPage,
  // Invite links carry the short id; `code` is free-form text and passes through.
  params: {
    parse: ({ toteId, code }) => ({ toteId: fromUrlId(toteId), code }),
    stringify: ({ toteId, code }) => ({ toteId: toUrlId(toteId), code }),
  },
})

function JoinPage() {
  const { toteId, code } = Route.useParams()
  const hydrated = useHydrated()
  const navigate = useNavigate()
  const { setActiveTote } = useActiveTote()
  const [error, setError] = useState(false)
  const startedRef = useRef(false)

  useEffect(() => {
    if (!hydrated || startedRef.current) return
    const userId = currentUserId()
    if (!userId) return
    startedRef.current = true

    // Straight through the record API rather than the collection: a rejected
    // optimistic insert is a rollback we'd have to observe; a rejected POST is
    // just a caught error.
    client
      .records('tote_members')
      .create({
        id: newId(),
        tote_id: toteId,
        user_id: userId,
        role: 'member',
        joined_with_code: code,
      })
      .then(() => {
        setActiveTote(toteId)
        // Full reload: the collections need to (re)fetch the rows the new
        // membership just made readable.
        window.location.replace('/')
      })
      .catch((err: unknown) => {
        // A unique-constraint conflict means "already a member" — the link
        // did its job; go shopping.
        const status =
          typeof err === 'object' && err && 'status' in err ? (err as { status: number }).status : 0
        if (status === 409) {
          setActiveTote(toteId)
          window.location.replace('/')
          return
        }
        setError(true)
      })
  }, [hydrated, toteId, code, setActiveTote])

  return (
    <div className="grid place-items-center pt-24">
      {error ? (
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <p className="text-destructive">{m.join_error()}</p>
          <Button variant="outline" onClick={() => void navigate({ to: '/' })}>
            {m.app_name()}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground">{m.loading()}</p>
      )}
    </div>
  )
}
