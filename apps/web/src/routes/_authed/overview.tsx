/**
 * The cross-tote view: every `buy` item from every tote I'm in, grouped
 * market → department with a tote badge per item — one glance says whether a
 * single Grand Frais run covers both the family list and the BBQ.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import type { ItemRow } from '#/db/collections'
import { useAllItems, useMyTotes } from '#/db/hooks'
import { useLiveQuery } from '@tanstack/react-db'
import { departmentsCollection, marketsCollection } from '#/db/collections'
import { useHydrated } from '#/db/hooks'
import { Badge } from '#/components/ui/badge'
import { Qty } from '#/components/qty'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/overview')({ component: OverviewPage })

function OverviewPage() {
  const hydrated = useHydrated()
  const totes = useMyTotes()
  const items = useAllItems()
  const { data: markets } = useLiveQuery({ query: (q) => q.from({ markets: marketsCollection }) })
  const { data: departments } = useLiveQuery({
    query: (q) => q.from({ departments: departmentsCollection }),
  })
  const [byTote, setByTote] = useState(false)

  if (!hydrated) return null

  const myToteIds = new Set(totes.map((tote) => tote.id))
  const toteName = new Map(totes.map((tote) => [tote.id, tote.name]))
  const buyItems = items.filter((item) => item.status === 'buy' && myToteIds.has(item.tote_id))

  const marketName = new Map(markets.map((market) => [market.id, market.name]))
  const departmentName = new Map(departments.map((dept) => [dept.id, dept.name]))

  // group key → items; keys carry their display names so rendering is a walk.
  const groups = new Map<string, { title: string; sub: Map<string, { title: string; items: ItemRow[] }> }>()
  const outerKey = (item: ItemRow) => (byTote ? item.tote_id : (item.market_id ?? ''))
  const outerTitle = (item: ItemRow) =>
    byTote
      ? (toteName.get(item.tote_id) ?? '?')
      : item.market_id
        ? (marketName.get(item.market_id) ?? '?')
        : m.no_market()
  const innerKey = (item: ItemRow) => (byTote ? (item.market_id ?? '') : (item.department_id ?? ''))
  const innerTitle = (item: ItemRow) =>
    byTote
      ? item.market_id
        ? (marketName.get(item.market_id) ?? '?')
        : m.no_market()
      : item.department_id
        ? (departmentName.get(item.department_id) ?? m.other_department())
        : m.other_department()

  for (const item of buyItems) {
    const outer = groups.get(outerKey(item)) ?? { title: outerTitle(item), sub: new Map() }
    const inner = outer.sub.get(innerKey(item)) ?? { title: innerTitle(item), items: [] }
    inner.items.push(item)
    outer.sub.set(innerKey(item), inner)
    groups.set(outerKey(item), outer)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{m.overview_title()}</h1>
        <button
          type="button"
          onClick={() => setByTote((value) => !value)}
          className="min-h-9 rounded-lg border bg-card px-3 text-sm hover:bg-secondary"
        >
          {byTote ? m.group_by_market() : m.group_by_tote()}
        </button>
      </div>

      {buyItems.length === 0 ? (
        <p className="pt-8 text-center text-sm text-muted-foreground">{m.overview_empty()}</p>
      ) : (
        [...groups.entries()]
          .sort(([, a], [, b]) => a.title.localeCompare(b.title))
          .map(([key, group]) => (
            <section key={key || 'none'} className="rounded-xl border bg-card p-3">
              <h2 className="mb-2 font-semibold">{group.title}</h2>
              {[...group.sub.entries()]
                .sort(([, a], [, b]) => a.title.localeCompare(b.title))
                .map(([subKey, sub]) => (
                  <div key={subKey || 'none'} className="mb-2">
                    <h3 className="mb-1 text-sm font-medium text-muted-foreground">{sub.title}</h3>
                    <ul className="flex flex-col gap-1">
                      {sub.items
                        .sort((a, b) => a.sort - b.sort)
                        .map((item) => (
                          <li key={item.id} className="flex min-h-9 items-center gap-2">
                            <span className="min-w-0 flex-1 truncate">{item.title}</span>
                            <Qty item={item} />
                            {!byTote && (
                              <Badge variant="secondary">{toteName.get(item.tote_id) ?? '?'}</Badge>
                            )}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
            </section>
          ))
      )}
    </div>
  )
}
