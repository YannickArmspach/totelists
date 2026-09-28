/**
 * The collapsible "in the bag" section under a shopping list: today's checked
 * items, the latest check first, each undoable, who bagged it shown.
 */
import { useState } from 'react'
import { RotateCcw } from 'lucide-react'

import { itemsCollection, type ItemRow } from '#/db/collections'
import { byBoughtDesc, undoCheckOff } from '#/lib/items'
import { useMemberInitial } from '#/db/hooks'
import { Avatar } from '#/components/avatar'
import { Button } from '#/components/ui/button'
import { m } from '#/paraglide/messages'

export function BoughtToday({ toteId, items }: { toteId: string; items: ItemRow[] }) {
  const [open, setOpen] = useState(false)
  const initialOf = useMemberInitial(toteId)

  const startOfToday = new Date().setHours(0, 0, 0, 0) / 1000
  const bought = items
    .filter((item) => item.status === 'bought' && (item.bought_at ?? 0) >= startOfToday)
    .sort(byBoughtDesc)

  if (bought.length === 0) return null

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="mb-2 text-sm font-medium text-muted-foreground underline-offset-2 hover:underline"
      >
        {m.bought_today()} ({bought.length}) {open ? '▾' : '▸'}
      </button>
      {open && (
        <ul className="flex flex-col gap-1.5">
          {bought.map((item) => (
            <li
              key={item.id}
              className="flex min-h-11 items-center gap-2 rounded-lg border bg-secondary/50 px-3 text-muted-foreground"
            >
              <span className="min-w-0 flex-1 truncate line-through">{item.title}</span>
              {item.bought_by && (
                <Avatar userId={item.bought_by} label={initialOf(item.bought_by)} size="sm" />
              )}
              <Button
                variant="ghost"
                size="sm"
                aria-label={m.undo()}
                onClick={() => {
                  const patch = undoCheckOff()
                  itemsCollection.update(item.id, (draft) => Object.assign(draft, patch))
                }}
              >
                <RotateCcw />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
