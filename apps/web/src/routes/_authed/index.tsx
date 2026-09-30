/**
 * Home: the big Say-it button first (it targets the active tote), the review
 * inbox right under what you just said, then the tote card strip and the
 * market shortcuts. Totes and markets live on their own pages — /tote/{id}
 * and /market/{id} — a tap away.
 */
import { Link, createFileRoute } from '@tanstack/react-router'

import { useClassifyMarkets, useHydrated, useMyTotes, useToteItems } from '#/db/hooks'
import { useActiveTote } from '#/stores/active-tote'
import { AddIt } from '#/components/add-it'
import { MyMarkets } from '#/components/my-markets'
import { ReviewInbox } from '#/components/review-inbox'
import { ToteCards } from '#/components/tote-cards'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/')({ component: HomePage })

function HomePage() {
  const hydrated = useHydrated()
  const totes = useMyTotes()
  const { activeToteId } = useActiveTote()
  const active = totes.find((tote) => tote.id === activeToteId) ?? totes[0]

  const classifyMarkets = useClassifyMarkets()
  const items = useToteItems(active?.id)

  if (!hydrated) return null

  if (totes.length === 0) return <FirstTote />
  if (!active) return null

  return (
    <div className="flex flex-col gap-8 pt-4">
      <AddIt toteId={active.id} markets={classifyMarkets} />

      <ReviewInbox items={items} />

      <ToteCards />

      <MyMarkets />
    </div>
  )
}

/**
 * A brand-new account has no tote, so it has nothing to say into. The one job
 * here is to get them to /tote/new — which owns creation, including telling
 * them when it fails.
 */
function FirstTote() {
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 pt-16 text-center">
      <h1 className="text-2xl font-semibold">{m.first_tote_title()}</h1>
      <p className="text-sm text-muted-foreground">{m.first_tote_hint()}</p>
      <Link
        to="/tote/new"
        className="inline-flex min-h-11 items-center justify-center self-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        {m.new_tote()}
      </Link>
    </div>
  )
}
