/**
 * Bought history for the active tote, grouped by day, who-bagged-it included.
 */
import { createFileRoute } from '@tanstack/react-router'

import { useToteItems, useToteMembers } from '#/db/hooks'
import { useActiveTote } from '#/stores/active-tote'
import { Qty } from '#/components/qty'
import { getLocale } from '#/paraglide/runtime'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/history')({ component: HistoryPage })

function HistoryPage() {
  const { activeToteId } = useActiveTote()
  const items = useToteItems(activeToteId)
  const members = useToteMembers(activeToteId)

  const bought = items
    .filter((item) => item.status === 'bought' && item.bought_at)
    .sort((a, b) => (b.bought_at ?? 0) - (a.bought_at ?? 0))

  const days = new Map<string, typeof bought>()
  const formatter = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'full' })
  for (const item of bought) {
    const day = formatter.format(new Date((item.bought_at ?? 0) * 1000))
    const list = days.get(day)
    if (list) list.push(item)
    else days.set(day, [item])
  }

  // No profile names on the record API: an initial from the member row's id is
  // all there is to show, so "who" reads as a colored dot with a tooltip-ish
  // letter. Good enough for a household.
  const initialOf = (userId: string | null | undefined) => {
    if (!userId) return ''
    const index = members.findIndex((member) => member.user_id === userId)
    return index === -1 ? '?' : String.fromCharCode(65 + (index % 26))
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{m.history_title()}</h1>
      {bought.length === 0 ? (
        <p className="pt-8 text-center text-sm text-muted-foreground">{m.history_empty()}</p>
      ) : (
        [...days.entries()].map(([day, list]) => (
          <section key={day}>
            <h2 className="mb-1.5 text-sm font-medium text-muted-foreground">{day}</h2>
            <ul className="flex flex-col gap-1">
              {list.map((item) => (
                <li key={item.id} className="flex min-h-10 items-center gap-2 rounded-lg border bg-card px-3">
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <Qty item={item} />
                  {item.bought_by && (
                    <span className="grid size-6 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                      {initialOf(item.bought_by)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
