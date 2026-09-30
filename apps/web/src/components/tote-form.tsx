/**
 * The tote's own fields — every column on the table — shared by /tote/new and
 * /tote/{id}/edit, which ask for exactly the same thing.
 *
 * Submitting is async and can fail (the record API rejects, or the write times
 * out waiting for its own row to come back), so the caller hands over a
 * promise and this keeps the pending/error state. Nothing silently hangs.
 */
import { useState } from 'react'

import type { ToteRow, Visibility } from '#/db/collections'
import { Button } from '#/components/ui/button'
import { Input, Select, Textarea } from '#/components/ui/input'
import { m } from '#/paraglide/messages'

/*
  Keyed on the row's id so switching rows remounts the fields.
  These inputs are uncontrolled (`defaultValue`), and the breadcrumb switcher
  changes only a route param — React would reuse this component and keep the
  previous row's values on screen. Keying here rather than at each call site
  means no caller can forget.
*/
export function ToteForm(props: React.ComponentProps<typeof ToteFormFields>) {
  return <ToteFormFields key={props.tote?.id ?? 'new'} {...props} />
}

export interface ToteFields {
  name: string
  description: string
  visibility: Visibility
}

function ToteFormFields({
  tote,
  submitLabel,
  disabled = false,
  onSubmit,
}: {
  /** Existing values when editing; omitted when creating. */
  tote?: ToteRow
  submitLabel: string
  disabled?: boolean
  onSubmit: (fields: ToteFields) => Promise<unknown> | void
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
            description: String(form.get('description') ?? '').trim(),
            visibility: form.get('visibility') === 'public' ? 'public' : 'private',
          }),
        )
          .catch(() => setFailed(true))
          .finally(() => setPending(false))
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        {m.tote_name_label()}
        <Input name="name" defaultValue={tote?.name} disabled={disabled} required />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        {m.tote_description_label()}
        <Textarea
          name="description"
          defaultValue={tote?.description ?? ''}
          placeholder={m.tote_description_placeholder()}
          disabled={disabled}
          rows={2}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        {m.visibility_label()}
        <Select name="visibility" defaultValue={tote?.visibility ?? 'private'} disabled={disabled}>
          <option value="private">{m.visibility_private()}</option>
          <option value="public">{m.visibility_public()}</option>
        </Select>
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
