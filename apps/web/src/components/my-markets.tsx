/**
 * Home's market shortcuts: every market the account can see, each with its
 * to-buy count summed across all my totes. A tap opens the cross-tote market
 * page, /user-{ownerId}/market-{marketId} — one glance before walking in says
 * what this store owes every list at once.
 */
import { Link } from '@tanstack/react-router'
import { ChevronRight, Store } from 'lucide-react'

import { useAllItems, useCatalogMarkets, useMyTotes } from '#/db/hooks'
import { m } from '#/paraglide/messages'

export function MyMarkets() {
  const markets = useCatalogMarkets()
  const totes = useMyTotes()
  const items = useAllItems()

  if (markets.length === 0) return null

  const myToteIds = new Set(totes.map((tote) => tote.id))
  const buyItems = items.filter((item) => item.status === 'buy' && myToteIds.has(item.tote_id))
  const buyCount = (marketId: string) =>
    buyItems.filter((item) => item.market_id === marketId).length

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">{m.my_markets()}</h2>
      {markets.map((market) => (
        <Link
          key={market.id}
          to="/user-{$userId}/market-{$marketId}"
          params={{ userId: market.created_by ?? 'unknown', marketId: market.id }}
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
  )
}
