/**
 * A department is only ever a name and a hint — that is the whole preset.
 * Shared by /department/new, /department/{id}/edit, and the inline
 * "add a custom department" form on a market's edit page.
 */
import { useState } from 'react'

import type { DepartmentRow } from '#/db/collections'
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
export function DepartmentForm(props: React.ComponentProps<typeof DepartmentFormFields>) {
  return <DepartmentFormFields key={props.department?.id ?? 'new'} {...props} />
}

export interface DepartmentFields {
  name: string
  classification_hint: string
}

function DepartmentFormFields({
  department,
  submitLabel,
  disabled = false,
  /** Clear the fields after a successful submit — the inline add-form does. */
  resetOnSubmit = false,
  onSubmit,
}: {
  department?: DepartmentRow
  submitLabel: string
  disabled?: boolean
  resetOnSubmit?: boolean
  onSubmit: (fields: DepartmentFields) => Promise<unknown> | void
}) {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (pending || disabled) return
        const element = event.currentTarget
        const form = new FormData(element)
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
          .then(() => {
            if (resetOnSubmit) element.reset()
          })
          .catch(() => setFailed(true))
          .finally(() => setPending(false))
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        {m.market_name_label()}
        <Input name="name" defaultValue={department?.name} disabled={disabled} required />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        {m.hint_label()}
        <Textarea
          name="classification_hint"
          defaultValue={department?.classification_hint ?? ''}
          placeholder={m.dept_hint_placeholder()}
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
