/**
 * A market's page across every tote: /user-{ownerId}/market-{marketId} shows
 * all my to-buy items routed to this market, flat or grouped by tote — the
 * standing-in-the-store view, whichever lists the items came from. Rows are
 * the same live BuyRow as a tote page: check off, edit, star, drag to reorder.
 *
 * Only the marketId loads anything; the userId half of the slug is the
 * market creator's id, there to namespace the URL, and is not verified.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { itemsCollection } from '#/db/collections'
import { useAllItems, useCatalogMarkets, useHydrated, useMyTotes } from '#/db/hooks'
import { BuyRow } from '#/components/buy-row'
import { GroupedSortable } from '#/components/grouped-sortable'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/user-{$userId}/market-{$marketId}')({
  component: MarketPage,
})

function MarketPage() {
  const { marketId } = Route.useParams()
  const hydrated = useHydrated()
  const markets = useCatalogMarkets()
  const totes = useMyTotes()
  const items = useAllItems()
  const [byTote, setByTote] = useState(false)

  if (!hydrated) return null

  const market = markets.find((entry) => entry.id === marketId)
  if (!market) {
    return <p className="pt-8 text-center text-sm text-muted-foreground">{m.not_found()}</p>
  }

  const myToteIds = new Set(totes.map((tote) => tote.id))
  const toteName = new Map(totes.map((tote) => [tote.id, tote.name]))
  const buyItems = items
    .filter(
      (item) =>
        item.status === 'buy' && item.market_id === marketId && myToteIds.has(item.tote_id),
    )
    .sort((a, b) => a.sort - b.sort)

  // tote id → its items, in tote order; the flat view uses buyItems directly.
  const byToteGroups = new Map<string, typeof buyItems>()
  for (const item of buyItems) {
    byToteGroups.set(item.tote_id, [...(byToteGroups.get(item.tote_id) ?? []), item])
  }

  const groups = byTote
    ? [...byToteGroups.entries()]
        .sort(([a], [b]) => (toteName.get(a) ?? '').localeCompare(toteName.get(b) ?? ''))
        .map(([toteId, group]) => ({
          key: toteId,
          header: (
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              {toteName.get(toteId) ?? '?'}
            </h2>
          ),
          items: group,
        }))
    : [{ key: 'all', items: buyItems }]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="min-w-0 truncate text-xl font-semibold">{market.name}</h1>
        <button
          type="button"
          onClick={() => setByTote((value) => !value)}
          className="min-h-9 shrink-0 rounded-lg border bg-card px-3 text-sm hover:bg-secondary"
        >
          {byTote ? m.group_none() : m.group_by_tote()}
        </button>
      </div>

      {buyItems.length === 0 ? (
        <p className="pt-8 text-center text-sm text-muted-foreground">{m.list_empty()}</p>
      ) : (
        <GroupedSortable
          groups={groups}
          onMove={({ updates }) => {
            // Sort only — dragging across tote groups must not move the item
            // to another tote, so a cross-group drop just reorders and the
            // item snaps home on the next render.
            for (const update of updates) {
              itemsCollection.update(update.id, (draft) => {
                draft.sort = update.sort
              })
            }
          }}
          renderItem={(item) => (
            <BuyRow item={item} bucket={byToteGroups.get(item.tote_id) ?? buyItems} />
          )}
        />
      )}
    </div>
  )
}
