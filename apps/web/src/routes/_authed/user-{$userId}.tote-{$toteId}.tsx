/**
 * A tote's page: /user-{ownerId}/tote-{toteId}. The say-it button over the
 * review inbox, market tiles with their to-buy counts — or, for a tote with no
 * markets, the flat list itself. Home keeps the capture surface; this is where
 * a tote actually lives.
 *
 * Only the toteId loads anything; the userId half of the slug is the owner's
 * id, there to namespace the URL, and is not verified.
 */
import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { ChevronRight, Store } from 'lucide-react'

import { itemsCollection } from '#/db/collections'
import {
  useAttachedMarkets,
  useClassifyMarkets,
  useHydrated,
  useTote,
  useToteItems,
} from '#/db/hooks'
import { useActiveTote } from '#/stores/active-tote'
import { AddIt } from '#/components/add-it'
import { ReviewInbox } from '#/components/review-inbox'
import { BoughtToday } from '#/components/bought-today'
import { BuyRow } from '#/components/buy-row'
import { GroupedSortable } from '#/components/grouped-sortable'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/user-{$userId}/tote-{$toteId}')({
  component: TotePage,
})

function TotePage() {
  const { toteId } = Route.useParams()
  const hydrated = useHydrated()
  const tote = useTote(toteId)
  const { setActiveTote } = useActiveTote()

  // Landing here IS choosing this tote: the other tabs (markets, history)
  // and home's say-it all follow the active id.
  useEffect(() => {
    if (hydrated && tote) setActiveTote(tote.id)
  }, [hydrated, tote, setActiveTote])

  const markets = useAttachedMarkets(toteId)
  const classifyMarkets = useClassifyMarkets(toteId)
  const items = useToteItems(toteId)

  if (!hydrated) return null
  if (!tote) {
    return <p className="pt-8 text-center text-sm text-muted-foreground">{m.not_found()}</p>
  }

  const buyItems = items.filter((item) => item.status === 'buy')
  const buyCount = (marketId: string) =>
    buyItems.filter((item) => item.market_id === marketId).length
  const rootItems = buyItems
    .filter((item) => !item.market_id)
    .sort((a, b) => a.sort - b.sort)

  return (
    <div className="flex flex-col gap-8">
      <div className="pt-4 text-center">
        <h1 className="text-xl font-semibold">{tote.name}</h1>
        {tote.description && (
          <p className="text-sm text-muted-foreground">{tote.description}</p>
        )}
      </div>

      <AddIt toteId={tote.id} markets={classifyMarkets} />

      <ReviewInbox items={items} />

      {markets.length > 0 && (
        <section className="flex flex-col gap-2">
          {markets.map(({ market }) => (
            <Link
              key={market.id}
              to="/markets/$marketId"
              params={{ marketId: market.id }}
              className="flex min-h-13 items-center gap-3 rounded-xl border bg-card px-4 hover:bg-secondary"
            >
              <Store className="size-5 text-primary" />
              <span className="min-w-0 flex-1 truncate font-medium">{market.name}</span>
              {buyCount(market.id) > 0 && (
                <span className="rounded-full bg-primary px-2.5 py-0.5 text-sm font-semibold text-primary-foreground">
                  {buyCount(market.id)}
                </span>
              )}
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </section>
      )}

      {rootItems.length > 0 && (
        <section>
          {markets.length > 0 && (
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">{m.no_market()}</h2>
          )}
          <GroupedSortable
            groups={[{ key: 'root', items: rootItems }]}
            onMove={({ updates }) => {
              for (const update of updates) {
                itemsCollection.update(update.id, (draft) => {
                  draft.sort = update.sort
                })
              }
            }}
            renderItem={(item) => <BuyRow item={item} bucket={rootItems} />}
          />
        </section>
      )}

      {markets.length === 0 && rootItems.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">{m.list_empty()}</p>
      )}

      {markets.length === 0 && (
        <BoughtToday toteId={tote.id} items={items.filter((item) => !item.market_id)} />
      )}
    </div>
  )
}
