/**
 * Create a tote, then go straight to it.
 *
 * Static `new` outranks the `$toteId` param in TanStack's route ranking, so
 * this never collides with /tote/{id}.
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { useMyTotes } from '#/db/hooks'
import { createTote } from '#/lib/totes'
import { ToteForm } from '#/components/tote-form'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/tote/new')({ component: NewTotePage })

function NewTotePage() {
  const navigate = useNavigate()
  const totes = useMyTotes()

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="text-xl font-semibold">{m.new_tote_title()}</h1>
      <ToteForm
        submitLabel={m.create()}
        onSubmit={async (fields) => {
          const tote = await createTote({ ...fields, sort: totes.length + 1 })
          await navigate({ to: '/tote/$toteId', params: { toteId: tote.id } })
        }}
      />
    </div>
  )
}
