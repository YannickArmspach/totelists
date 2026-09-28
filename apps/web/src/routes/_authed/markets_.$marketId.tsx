/**
 * The in-store page: one market of the active tote, its `buy` items grouped by
 * department. Departments are emergent — only ones with items here appear.
 * Dragging between groups re-routes; tapping the circle bags the item.
 */
import { createFileRoute } from '@tanstack/react-router'

import { itemsCollection } from '#/db/collections'
import { useAttachedMarkets, useToteItems } from '#/db/hooks'
import { groupByDepartment, sortAtEnd, topBoughtTitles } from '#/lib/items'
import { currentUserId } from '#/lib/auth'
import { newId } from '#/db/ids'
import { useActiveTote } from '#/stores/active-tote'
import { BoughtToday } from '#/components/bought-today'
import { BuyRow } from '#/components/buy-row'
import { GroupedSortable, type MoveResult } from '#/components/grouped-sortable'
import { Badge } from '#/components/ui/badge'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/markets_/$marketId')({ component: MarketPage })

function MarketPage() {
  const { marketId } = Route.useParams()
  const { activeToteId } = useActiveTote()
  const attached = useAttachedMarkets(activeToteId)
  const items = useToteItems(activeToteId)

  const entry = attached.find(({ market }) => market.id === marketId)
  if (!entry) return <p className="pt-8 text-center text-sm text-muted-foreground">{m.not_found()}</p>

  const marketItems = items.filter((item) => item.market_id === marketId)
  const buyItems = marketItems.filter((item) => item.status === 'buy')
  const groups = groupByDepartment(buyItems, entry.departments)

  const suggestions = topBoughtTitles(items, activeToteId!, marketId)

  const onMove = ({ itemId, groupKey, updates }: MoveResult) => {
    const departmentId = groupKey === 'other' ? null : groupKey
    itemsCollection.update(itemId, (draft) => {
      draft.department_id = departmentId
      draft.updated_at = Math.floor(Date.now() / 1000)
    })
    for (const update of updates) {
      itemsCollection.update(update.id, (draft) => {
        draft.sort = update.sort
      })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{entry.market.name}</h1>

      {buyItems.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">{m.list_empty()}</p>
      ) : (
        <GroupedSortable
          groups={groups.map((group) => ({
            key: group.department?.id ?? 'other',
            header: (
              <h2 className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                {group.department?.name ?? m.other_department()}
                {group.department?.auto_created === 1 && (
                  <Badge variant="outline">{m.auto_created_badge()}</Badge>
                )}
              </h2>
            ),
            items: group.items,
          }))}
          onMove={onMove}
          renderItem={(item) => (
            <BuyRow
              item={item}
              bucket={
                groups.find((group) => (group.department?.id ?? null) === (item.department_id ?? null))
                  ?.items ?? buyItems
              }
            />
          )}
        />
      )}

      {suggestions.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">{m.suggestions_title()}</h2>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((title) => (
              <button
                key={title}
                type="button"
                onClick={() =>
                  itemsCollection.insert({
                    id: newId(),
                    tote_id: activeToteId!,
                    created_by: currentUserId(),
                    market_id: marketId,
                    department_id: null,
                    title,
                    number: null,
                    unit: null,
                    description: '',
                    price_cents: null,
                    status: 'buy',
                    bought_at: null,
                    bought_by: null,
                    sort: sortAtEnd(buyItems),
                  })
                }
                className="min-h-9 rounded-full border bg-card px-3 text-sm hover:bg-secondary"
              >
                + {title}
              </button>
            ))}
          </div>
        </section>
      )}

      <BoughtToday toteId={activeToteId!} items={marketItems} />
    </div>
  )
}
