/**
 * The full item editor: title, quantity, unit, note, price — and the manual
 * routing override (market select, then that market's departments).
 */
import { useState } from 'react'

import { itemsCollection, type ItemRow } from '#/db/collections'
import { useAttachedMarkets } from '#/db/hooks'
import { UNITS, type Unit } from '#/lib/classify/units'
import { Button } from '#/components/ui/button'
import { Dialog } from '#/components/ui/dialog'
import { Input, Select } from '#/components/ui/input'
import { m } from '#/paraglide/messages'

export function ItemEditDialog({ item, onClose }: { item: ItemRow; onClose: () => void }) {
  const attached = useAttachedMarkets(item.tote_id)
  const [marketId, setMarketId] = useState(item.market_id ?? '')
  const departments = attached.find((entry) => entry.market.id === marketId)?.departments ?? []

  return (
    <Dialog open onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          const number = Number(form.get('number'))
          const unit = String(form.get('unit') ?? '')
          const price = String(form.get('price') ?? '').replace(',', '.')
          const departmentId = String(form.get('department') ?? '')
          itemsCollection.update(item.id, (draft) => {
            draft.title = String(form.get('title') ?? item.title).trim() || item.title
            draft.number = Number.isFinite(number) && number > 0 ? number : null
            draft.unit = (UNITS as readonly string[]).includes(unit) ? (unit as Unit) : null
            draft.description = String(form.get('description') ?? '').trim()
            draft.price_cents = price ? Math.round(Number(price) * 100) || null : null
            draft.market_id = marketId || null
            draft.department_id = marketId && departmentId ? departmentId : null
            draft.updated_at = Math.floor(Date.now() / 1000)
          })
          onClose()
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium">
          {m.title_label()}
          <Input name="title" defaultValue={item.title} required />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {m.quantity_label()}
            <Input name="number" type="number" step="any" min="0" defaultValue={item.number ?? ''} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {m.unit_label()}
            <Select name="unit" defaultValue={item.unit ?? ''}>
              <option value="">{m.unit_none()}</option>
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {m.price_label()}
            <Input
              name="price"
              inputMode="decimal"
              defaultValue={item.price_cents != null ? (item.price_cents / 100).toString() : ''}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {m.description_label()}
          <Input name="description" defaultValue={item.description} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {m.market_label()}
            <Select value={marketId} onChange={(event) => setMarketId(event.target.value)}>
              <option value="">{m.no_market()}</option>
              {attached.map(({ market }) => (
                <option key={market.id} value={market.id}>
                  {market.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {m.department_label()}
            <Select name="department" defaultValue={item.department_id ?? ''} disabled={!marketId}>
              <option value="">{m.no_department()}</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <div className="flex justify-between gap-2 pt-1">
          <Button
            variant="destructive"
            onClick={() => {
              itemsCollection.delete(item.id)
              onClose()
            }}
          >
            {m.delete()}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              {m.cancel()}
            </Button>
            <Button type="submit">{m.save()}</Button>
          </div>
        </div>
      </form>
    </Dialog>
  )
}
