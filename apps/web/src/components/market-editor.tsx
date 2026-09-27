/**
 * Editing a catalog market from inside one tote.
 *
 * Who may do what is the catalog's whole subtlety:
 * - the creator editing a market only this tote uses → plain update;
 * - the creator editing a market other totes also use → asked: update
 *   everywhere, or copy for this tote;
 * - anyone else → always copy-on-write (the server would refuse the UPDATE).
 */
import { useState } from 'react'

import type { AttachedMarket } from '#/db/hooks'
import { useMarketUsage, useToteItems } from '#/db/hooks'
import { marketsCollection, departmentsCollection, itemsCollection } from '#/db/collections'
import {
  copyDepartmentForTote,
  copyMarketForTote,
  type MarketEdits,
} from '#/lib/catalog'
import { currentUserId, useUser } from '#/lib/auth'
import { newId } from '#/db/ids'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Dialog } from '#/components/ui/dialog'
import { Input, Textarea } from '#/components/ui/input'
import { m } from '#/paraglide/messages'

export function MarketEditDialog({
  toteId,
  entry,
  onClose,
}: {
  toteId: string
  entry: AttachedMarket
  onClose: () => void
}) {
  const user = useUser()
  const usage = useMarketUsage(entry.market.id)
  const items = useToteItems(toteId)
  const [pendingEdits, setPendingEdits] = useState<MarketEdits | null>(null)

  const isCreator = entry.market.created_by === user?.id
  const usedElsewhere = usage.length > 1

  const applyInPlace = (edits: MarketEdits) => {
    marketsCollection.update(entry.market.id, (draft) => {
      if (edits.name) draft.name = edits.name
      if (edits.classification_hint !== undefined) draft.classification_hint = edits.classification_hint
      draft.updated_at = Math.floor(Date.now() / 1000)
    })
    onClose()
  }

  const applyAsCopy = (edits: MarketEdits) => {
    copyMarketForTote(toteId, entry.market, entry.departments, entry.attachment, items, edits)
    onClose()
  }

  const submit = (edits: MarketEdits) => {
    if (!isCreator) return applyAsCopy(edits)
    if (usedElsewhere) return setPendingEdits(edits) // ask first
    applyInPlace(edits)
  }

  return (
    <Dialog open onClose={onClose}>
      {pendingEdits ? (
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold">{m.edit_scope_title()}</h2>
          <Button onClick={() => applyInPlace(pendingEdits)}>{m.update_everywhere()}</Button>
          <Button variant="secondary" onClick={() => applyAsCopy(pendingEdits)}>
            {m.copy_for_tote()}
          </Button>
          <Button variant="ghost" onClick={() => setPendingEdits(null)}>
            {m.cancel()}
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            const name = String(form.get('name') ?? '').trim()
            if (!name) return
            submit({ name, classification_hint: String(form.get('hint') ?? '').trim() })
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-medium">
            {m.market_name_label()}
            <Input name="name" defaultValue={entry.market.name} required />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {m.hint_label()}
            <Textarea
              name="hint"
              defaultValue={entry.market.classification_hint}
              placeholder={m.market_hint_placeholder()}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {m.cancel()}
            </Button>
            <Button type="submit">{m.save()}</Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

export function DepartmentsEditor({ toteId, entry }: { toteId: string; entry: AttachedMarket }) {
  const user = useUser()
  const items = useToteItems(toteId)
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = entry.departments.find((dept) => dept.id === editingId)

  const canEditInPlace = (createdBy: string | null | undefined) =>
    createdBy === user?.id || entry.market.created_by === user?.id

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">{m.departments_title()}</h3>
      <ul className="flex flex-col gap-1.5">
        {entry.departments.map((dept) => (
          <li key={dept.id} className="flex min-h-11 items-center gap-2 rounded-lg border bg-card px-3">
            <button
              type="button"
              onClick={() => setEditingId(dept.id)}
              className="min-w-0 flex-1 truncate text-left text-sm"
            >
              {dept.name}
              {dept.classification_hint && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {dept.classification_hint}
                </span>
              )}
            </button>
            {dept.auto_created === 1 && <Badge variant="outline">{m.auto_created_badge()}</Badge>}
          </li>
        ))}
      </ul>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const input = event.currentTarget.elements.namedItem('name') as HTMLInputElement
          const name = input.value.trim()
          if (!name) return
          departmentsCollection.insert({
            id: newId(),
            market_id: entry.market.id,
            created_by: currentUserId(),
            name,
            classification_hint: '',
            sort: entry.departments.length + 1,
            auto_created: 0,
          })
          input.value = ''
        }}
      >
        <Input name="name" placeholder={m.new_department()} aria-label={m.new_department()} />
        <Button type="submit" variant="secondary">
          {m.add()}
        </Button>
      </form>

      {editing && (
        <Dialog open onClose={() => setEditingId(null)}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              const form = new FormData(event.currentTarget)
              const name = String(form.get('name') ?? '').trim()
              const hint = String(form.get('hint') ?? '').trim()
              if (!name) return
              if (canEditInPlace(editing.created_by)) {
                departmentsCollection.update(editing.id, (draft) => {
                  draft.name = name
                  draft.classification_hint = hint
                })
              } else {
                copyDepartmentForTote(toteId, editing, items, { name, classification_hint: hint })
              }
              setEditingId(null)
            }}
          >
            <label className="flex flex-col gap-1 text-sm font-medium">
              {m.market_name_label()}
              <Input name="name" defaultValue={editing.name} required />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              {m.hint_label()}
              <Textarea
                name="hint"
                defaultValue={editing.classification_hint}
                placeholder={m.dept_hint_placeholder()}
              />
            </label>
            <div className="flex justify-between gap-2">
              <Button
                variant="destructive"
                onClick={() => {
                  // This tote's items fall back to the "Other" bucket first, so
                  // the delete never leaves them pointing at a ghost.
                  const now = Math.floor(Date.now() / 1000)
                  for (const item of items) {
                    if (item.department_id !== editing.id) continue
                    itemsCollection.update(item.id, (draft) => {
                      draft.department_id = null
                      draft.updated_at = now
                    })
                  }
                  departmentsCollection.delete(editing.id)
                  setEditingId(null)
                }}
              >
                {m.delete()}
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setEditingId(null)}>
                  {m.cancel()}
                </Button>
                <Button type="submit">{m.save()}</Button>
              </div>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  )
}
