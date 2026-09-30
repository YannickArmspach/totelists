/**
 * My markets: every shop on the account, in the order you want to see them.
 *
 * Markets are no longer attached to individual totes — you shop the same few
 * places whatever list you are carrying — so this is a plain catalog, the same
 * shape as /totes. Dragging sets the order the tiles take on every tote page.
 */
import { Link, createFileRoute } from '@tanstack/react-router'
import { Pencil, Plus, Store } from 'lucide-react'

import { marketsCollection } from '#/db/collections'
import { useAllItems, useCatalogMarkets, useHydrated, useMyTotes } from '#/db/hooks'
import { SortableList } from '#/components/sortable-list'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/markets')({ component: MarketsPage })

function MarketsPage() {
  const hydrated = useHydrated()
  const markets = useCatalogMarkets()
  const totes = useMyTotes()
  const items = useAllItems()

  if (!hydrated) return null

  const myToteIds = new Set(totes.map((tote) => tote.id))
  const buyCount = (marketId: string) =>
    items.filter(
      (item) => item.status === 'buy' && item.market_id === marketId && myToteIds.has(item.tote_id),
    ).length

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{m.markets_title()}</h1>

      <SortableList
        items={markets}
        onReorder={(ordered) => {
          // A short list, so renumbering all of it beats fractional ranking.
          ordered.forEach((market, index) => {
            if (market.sort === index + 1) return
            marketsCollection.update(market.id, (draft) => {
              draft.sort = index + 1
            })
          })
        }}
        renderItem={(market) => (
          <div className="flex min-h-13 items-center gap-2 rounded-xl border bg-card px-3">
            <Link
              to="/market/$marketId"
              params={{ marketId: market.id }}
              className="flex min-w-0 flex-1 items-center gap-3 py-2"
            >
              <Store className="size-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate font-medium">{market.name}</span>
              {buyCount(market.id) > 0 && (
                <span className="shrink-0 rounded-full bg-primary px-2.5 py-0.5 text-sm font-semibold text-primary-foreground">
                  {buyCount(market.id)}
                </span>
              )}
            </Link>
            <Link
              to="/market/$marketId/edit"
              params={{ marketId: market.id }}
              aria-label={m.edit_market_title()}
              className="grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
            >
              <Pencil className="size-4" />
            </Link>
          </div>
        )}
      />

      <Link
        to="/market/new"
        className="flex min-h-13 items-center justify-center gap-1.5 rounded-xl border border-dashed text-sm font-medium text-muted-foreground hover:bg-secondary"
      >
        <Plus className="size-4" />
        {m.new_market()}
      </Link>
    </div>
  )
}
