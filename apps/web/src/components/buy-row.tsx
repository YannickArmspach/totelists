/**
 * One line of a shopping list:
 *
 *   {checkbox} {number+unit} × **{title}** {note, small and greyed}   {assignee} {star}
 *
 * Tap the circle to bag it, tap the text to edit, tap the star to pin the
 * item to the top of its bucket (the star rewrites `sort`, display order
 * stays purely sort-driven).
 */
import { useState } from 'react'
import { Check, Star } from 'lucide-react'

import { itemsCollection, type ItemRow } from '#/db/collections'
import { checkOff, sortAtTop } from '#/lib/items'
import { currentUserId } from '#/lib/auth'
import { useMemberInitial } from '#/db/hooks'
import { formatPrice } from '#/components/qty'
import { Avatar } from '#/components/avatar'
import { ItemEditDialog } from '#/components/item-edit-dialog'
import { cn } from '#/lib/utils'

function qtyLabel(item: ItemRow): string | null {
  if (item.number == null) return null
  const unit = item.unit && item.unit !== 'piece' ? ` ${item.unit}` : ''
  return `${item.number}${unit}`
}

export function BuyRow({ item, bucket }: { item: ItemRow; bucket: ItemRow[] }) {
  const [editing, setEditing] = useState(false)
  const initialOf = useMemberInitial(item.tote_id)
  const qty = qtyLabel(item)
  const price = formatPrice(item.price_cents)
  const starred = item.starred === 1

  const toggleStar = () =>
    itemsCollection.update(item.id, (draft) => {
      draft.starred = starred ? 0 : 1
      if (!starred) draft.sort = sortAtTop(bucket)
      draft.updated_at = Math.floor(Date.now() / 1000)
    })

  return (
    <div className="flex min-h-12 items-center gap-2.5 rounded-lg border bg-card px-3">
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
        className="flex min-w-0 flex-1 items-baseline gap-1.5 py-2 text-left"
      >
        {qty && (
          <span className="shrink-0 text-sm text-muted-foreground">
            {qty} <span aria-hidden>×</span>
          </span>
        )}
        <span className="min-w-0 truncate font-semibold">{item.title}</span>
        {item.description && (
          <small className="min-w-0 truncate text-xs text-muted-foreground/80">
            {item.description}
          </small>
        )}
        {price && <span className="ml-auto shrink-0 text-sm text-muted-foreground">{price}</span>}
      </button>

      {item.assigned_to && (
        <Avatar userId={item.assigned_to} label={initialOf(item.assigned_to)} size="sm" />
      )}

      <button
        type="button"
        onClick={toggleStar}
        aria-label="star"
        aria-pressed={starred}
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-lg',
          starred ? 'text-amber-500' : 'text-muted-foreground/40 hover:text-muted-foreground',
        )}
      >
        <Star className={cn('size-4', starred && 'fill-current')} />
      </button>

      {editing && <ItemEditDialog item={item} onClose={() => setEditing(false)} />}
    </div>
  )
}
