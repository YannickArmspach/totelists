/**
 * Editing a catalog market from inside one tote.
 *
 * Who may do what is the catalog's whole subtlety:
 * - the creator editing a market only this tote uses → plain update;
 * - the creator editing a market other totes also use → asked: update
 *   everywhere, or copy for this tote;
 * - anyone else → always copy-on-write (the server would refuse the UPDATE).
 *
 * Departments are managed on their own tab (/departments), never here.
 */
import { useState } from 'react'

import type { AttachedMarket } from '#/db/hooks'
import { useMarketUsage, useToteItems } from '#/db/hooks'
import { marketsCollection } from '#/db/collections'
import { copyMarketForTote, type MarketEdits } from '#/lib/catalog'
import { useUser } from '#/lib/auth'
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
