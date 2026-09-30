/**
 * The review section: everything the classifier (or quick-add) just bagged, as
 * `new` items. It sits right under AddIt on the home page, between what you
 * just said and the lists it will land in — fix the routing if the AI guessed
 * wrong, then promote. Nothing to review means nothing to render.
 */
import { useState } from 'react'
import { ArrowRight, Trash2 } from 'lucide-react'

import { itemsCollection, type ItemRow } from '#/db/collections'
import { useMarketsWithDepartments } from '#/db/hooks'
import { promote } from '#/lib/items'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Select } from '#/components/ui/input'
import { Qty } from '#/components/qty'
import { ItemEditDialog } from '#/components/item-edit-dialog'
import { m } from '#/paraglide/messages'

export function ReviewInbox({ items }: { items: ItemRow[] }) {
  const newItems = items
    .filter((item) => item.status === 'new')
    .sort((a, b) => b.id.localeCompare(a.id)) // newest first

  if (newItems.length === 0) return null

  const promoteAll = () => {
    const patch = promote()
    for (const item of newItems) {
      itemsCollection.update(item.id, (draft) => Object.assign(draft, patch))
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">{m.inbox_title()}</h2>
        {newItems.length > 1 && (
          <Button variant="secondary" size="sm" onClick={promoteAll}>
            {m.promote_all()}
          </Button>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {newItems.map((item) => (
          <InboxCard key={item.id} item={item} />
        ))}
      </ul>
    </section>
  )
}

function InboxCard({ item }: { item: ItemRow }) {
  const attached = useMarketsWithDepartments()
  const [editing, setEditing] = useState(false)
  const departments = attached.find((entry) => entry.market.id === item.market_id)?.departments ?? []
  const department = departments.find((dept) => dept.id === item.department_id)

  const patch = (updates: Partial<ItemRow>) =>
    itemsCollection.update(item.id, (draft) => Object.assign(draft, updates))

  return (
    <li className="flex flex-col gap-2 rounded-xl border bg-card p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="min-w-0 flex-1 truncate text-left font-medium"
        >
          {item.title}
          {item.description && (
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
              {item.description}
            </span>
          )}
        </button>
        <Qty item={item} />
        {department?.auto_created === 1 && <Badge variant="outline">{m.auto_created_badge()}</Badge>}
      </div>

      {attached.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={item.market_id ?? ''}
            aria-label={m.market_label()}
            onChange={(event) =>
              patch({ market_id: event.target.value || null, department_id: null })
            }
          >
            <option value="">{m.no_market()}</option>
            {attached.map(({ market }) => (
              <option key={market.id} value={market.id}>
                {market.name}
              </option>
            ))}
          </Select>
          <Select
            value={item.department_id ?? ''}
            aria-label={m.department_label()}
            disabled={!item.market_id}
            onChange={(event) => patch({ department_id: event.target.value || null })}
          >
            <option value="">{m.no_department()}</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => itemsCollection.delete(item.id)}
          aria-label={m.delete()}
        >
          <Trash2 />
        </Button>
        <Button size="sm" onClick={() => patch(promote())}>
          {m.promote()} <ArrowRight />
        </Button>
      </div>

      {editing && <ItemEditDialog item={item} onClose={() => setEditing(false)} />}
    </li>
  )
}
