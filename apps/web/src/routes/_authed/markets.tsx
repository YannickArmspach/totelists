/**
 * The active tote's markets: attach from the catalog, create new ones, edit
 * (with the update-everywhere / copy-for-this-tote flow), reorder, detach.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { ChevronDown, ChevronUp, Pencil, Unlink } from 'lucide-react'

import { marketsCollection, toteMarketsCollection } from '#/db/collections'
import { useAttachedMarkets, useCatalogMarkets, useToteItems } from '#/db/hooks'
import { detachMarket } from '#/lib/catalog'
import { currentUserId } from '#/lib/auth'
import { newId } from '#/db/ids'
import { useActiveTote } from '#/stores/active-tote'
import { DepartmentsEditor, MarketEditDialog } from '#/components/market-editor'
import { Button } from '#/components/ui/button'
import { Input, Select, Textarea } from '#/components/ui/input'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/markets')({ component: MarketsPage })

function MarketsPage() {
  const { activeToteId } = useActiveTote()
  const attached = useAttachedMarkets(activeToteId)
  const catalog = useCatalogMarkets()
  const items = useToteItems(activeToteId)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!activeToteId) return null

  const attachedIds = new Set(attached.map(({ market }) => market.id))
  const attachable = catalog.filter((market) => !attachedIds.has(market.id))

  const reorder = (index: number, direction: -1 | 1) => {
    const other = attached[index + direction]
    const current = attached[index]
    if (!other || !current) return
    // Swapping the two sort values is enough for arrow-button reordering.
    toteMarketsCollection.update(current.attachment.id, (draft) => {
      draft.sort = other.attachment.sort
    })
    toteMarketsCollection.update(other.attachment.id, (draft) => {
      draft.sort = current.attachment.sort
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{m.markets_title()}</h1>

      <ul className="flex flex-col gap-3">
        {attached.map((entry, index) => (
          <li key={entry.attachment.id} className="rounded-xl border bg-card p-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setExpandedId(expandedId === entry.market.id ? null : entry.market.id)
                }
                className="min-w-0 flex-1 text-left"
              >
                <span className="font-medium">{entry.market.name}</span>
                {entry.market.classification_hint && (
                  <span className="ml-2 text-sm text-muted-foreground">
                    {entry.market.classification_hint}
                  </span>
                )}
              </button>
              <Button variant="ghost" size="icon" aria-label="up" disabled={index === 0} onClick={() => reorder(index, -1)}>
                <ChevronUp />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="down"
                disabled={index === attached.length - 1}
                onClick={() => reorder(index, 1)}
              >
                <ChevronDown />
              </Button>
              <Button variant="ghost" size="icon" aria-label={m.edit()} onClick={() => setEditingId(entry.market.id)}>
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={m.detach()}
                onClick={() => detachMarket(activeToteId, entry.attachment, items)}
              >
                <Unlink />
              </Button>
            </div>
            {expandedId === entry.market.id && (
              <div className="mt-3 border-t pt-3">
                <DepartmentsEditor toteId={activeToteId} entry={entry} />
              </div>
            )}
            {editingId === entry.market.id && (
              <MarketEditDialog toteId={activeToteId} entry={entry} onClose={() => setEditingId(null)} />
            )}
          </li>
        ))}
      </ul>

      {attachable.length > 0 && (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const marketId = String(new FormData(event.currentTarget).get('market') ?? '')
            if (!marketId) return
            toteMarketsCollection.insert({
              id: newId(),
              tote_id: activeToteId,
              market_id: marketId,
              sort: attached.length + 1,
            })
          }}
        >
          <Select name="market" aria-label={m.attach_market()} defaultValue="">
            <option value="" disabled>
              {m.attach_market()}
            </option>
            {attachable.map((market) => (
              <option key={market.id} value={market.id}>
                {market.name}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            {m.add()}
          </Button>
        </form>
      )}

      <NewMarketForm
        onCreate={(name, hint) => {
          const marketId = newId()
          marketsCollection.insert({
            id: marketId,
            created_by: currentUserId(),
            name,
            classification_hint: hint,
          })
          toteMarketsCollection.insert({
            id: newId(),
            tote_id: activeToteId,
            market_id: marketId,
            sort: attached.length + 1,
          })
        }}
      />
    </div>
  )
}

function NewMarketForm({ onCreate }: { onCreate: (name: string, hint: string) => void }) {
  return (
    <form
      className="flex flex-col gap-2 rounded-xl border border-dashed p-3"
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const name = String(form.get('name') ?? '').trim()
        if (!name) return
        onCreate(name, String(form.get('hint') ?? '').trim())
        event.currentTarget.reset()
      }}
    >
      <h2 className="text-sm font-medium text-muted-foreground">{m.new_market()}</h2>
      <Input name="name" placeholder={m.market_name_label()} required />
      <Textarea name="hint" placeholder={m.market_hint_placeholder()} />
      <Button type="submit" variant="secondary" className="self-end">
        {m.create()}
      </Button>
    </form>
  )
}
