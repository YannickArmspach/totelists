import type { ItemRow } from '#/db/collections'
import { getLocale } from '#/paraglide/runtime'

/** "2 kg", "3", "" — the quantity as spoken, no unit invented. */
export function formatQty(item: Pick<ItemRow, 'number' | 'unit'>): string {
  if (item.number == null) return ''
  const n = new Intl.NumberFormat(getLocale()).format(item.number)
  if (!item.unit) return n
  return item.unit === 'piece' ? `${n}×` : `${n} ${item.unit}`
}

export function formatPrice(cents: number | null | undefined): string {
  if (cents == null) return ''
  return new Intl.NumberFormat(getLocale(), { style: 'currency', currency: 'EUR' }).format(
    cents / 100,
  )
}

export function Qty({ item }: { item: ItemRow }) {
  const qty = formatQty(item)
  const price = formatPrice(item.price_cents)
  if (!qty && !price) return null
  return (
    <span className="shrink-0 text-sm text-muted-foreground">
      {qty}
      {qty && price ? ' · ' : ''}
      {price}
    </span>
  )
}
