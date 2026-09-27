/**
 * One line of a shopping list: tap the circle to bag it, tap the text to edit.
 */
import { useState } from 'react'
import { Check } from 'lucide-react'

import { itemsCollection, type ItemRow } from '#/db/collections'
import { checkOff } from '#/lib/items'
import { currentUserId } from '#/lib/auth'
import { Qty } from '#/components/qty'
import { ItemEditDialog } from '#/components/item-edit-dialog'

export function BuyRow({ item }: { item: ItemRow }) {
  const [editing, setEditing] = useState(false)

  return (
    <div className="flex min-h-12 items-center gap-3 rounded-lg border bg-card px-3">
      <button
        type="button"
        onClick={() => {
          const userId = currentUserId()
          if (!userId) return
          const patch = checkOff(userId)
          itemsCollection.update(item.id, (draft) => Object.assign(draft, patch))
        }}
        className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-primary/50 text-transparent transition-colors hover:bg-accent active:bg-primary active:text-primary-foreground"
        aria-label={item.title}
      >
        <Check className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
      >
        <span className="min-w-0 flex-1 truncate">
          {item.title}
          {item.description && (
            <span className="ml-1.5 text-sm text-muted-foreground">{item.description}</span>
          )}
        </span>
        <Qty item={item} />
      </button>
      {editing && <ItemEditDialog item={item} onClose={() => setEditing(false)} />}
    </div>
  )
}
