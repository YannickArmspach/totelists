/**
 * A market's own fields, shared by /market/new and /market/{id}/edit.
 * Departments are attached on the edit page, never here — a market has to
 * exist before anything can be attached to it.
 */
import { useState } from 'react'

import type { MarketRow } from '#/db/collections'
import { Button } from '#/components/ui/button'
import { Input, Textarea } from '#/components/ui/input'
import { m } from '#/paraglide/messages'

/*
  Keyed on the row's id so switching rows remounts the fields.
  These inputs are uncontrolled (`defaultValue`), and the breadcrumb switcher
  changes only a route param — React would reuse this component and keep the
  previous row's values on screen. Keying here rather than at each call site
  means no caller can forget.
*/
export function MarketForm(props: React.ComponentProps<typeof MarketFormFields>) {
  return <MarketFormFields key={props.market?.id ?? 'new'} {...props} />
}

export interface MarketFields {
  name: string
  classification_hint: string
}

function MarketFormFields({
  market,
  submitLabel,
  disabled = false,
  onSubmit,
}: {
  market?: MarketRow
  submitLabel: string
  disabled?: boolean
  onSubmit: (fields: MarketFields) => Promise<unknown> | void
}) {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (pending || disabled) return
        const form = new FormData(event.currentTarget)
        const name = String(form.get('name') ?? '').trim()
        if (!name) return
        setPending(true)
        setFailed(false)
        void Promise.resolve(
          onSubmit({
            name,
            classification_hint: String(form.get('classification_hint') ?? '').trim(),
          }),
        )
          .catch(() => setFailed(true))
          .finally(() => setPending(false))
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        {m.market_name_label()}
        <Input name="name" defaultValue={market?.name} disabled={disabled} required />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        {m.hint_label()}
        <Textarea
          name="classification_hint"
          defaultValue={market?.classification_hint ?? ''}
          placeholder={m.market_hint_placeholder()}
          disabled={disabled}
          rows={2}
        />
      </label>

      {failed && <p className="text-sm text-destructive">{m.error_generic()}</p>}

      {!disabled && (
        <Button type="submit" variant="secondary" className="self-end" disabled={pending}>
          {pending ? m.loading() : submitLabel}
        </Button>
      )}
    </form>
  )
}
