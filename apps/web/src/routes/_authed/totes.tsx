/**
 * My totes, a creator form, and the public totes anyone may join.
 */
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Settings } from 'lucide-react'

import { toteMembersCollection, type ToteRow } from '#/db/collections'
import { useMyTotes, usePublicTotes } from '#/db/hooks'
import { currentUserId } from '#/lib/auth'
import { newId } from '#/db/ids'
import { useActiveTote } from '#/stores/active-tote'
import { createTote } from './index'
import { Button } from '#/components/ui/button'
import { Input, Select } from '#/components/ui/input'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/totes')({ component: TotesPage })

function TotesPage() {
  const totes = useMyTotes()
  const publicTotes = usePublicTotes()
  const { activeToteId, setActiveTote } = useActiveTote()
  const navigate = useNavigate()

  const open = (tote: ToteRow) => {
    setActiveTote(tote.id)
    void navigate({ to: '/' })
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{m.my_totes()}</h1>

      <ul className="flex flex-col gap-2">
        {totes.map((tote) => (
          <li key={tote.id} className="flex min-h-13 items-center gap-2 rounded-xl border bg-card px-3">
            <button type="button" onClick={() => open(tote)} className="min-w-0 flex-1 py-2 text-left">
              <span className="font-medium">{tote.name}</span>
              {tote.id === activeToteId && <span className="ml-2 text-primary">●</span>}
              <span className="ml-2 text-xs text-muted-foreground">
                {tote.visibility === 'public' ? m.visibility_public() : m.visibility_private()}
              </span>
            </button>
            <Link
              to="/totes/$toteId/settings"
              params={{ toteId: tote.id }}
              aria-label={m.tote_settings()}
              className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
            >
              <Settings className="size-4" />
            </Link>
          </li>
        ))}
      </ul>

      <form
        className="flex flex-col gap-2 rounded-xl border border-dashed p-3"
        onSubmit={(event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          const name = String(form.get('name') ?? '').trim()
          if (!name) return
          const visibility = form.get('visibility') === 'public' ? 'public' : 'private'
          void createTote(name, visibility).then(open)
        }}
      >
        <h2 className="text-sm font-medium text-muted-foreground">{m.new_tote()}</h2>
        <Input name="name" placeholder={m.tote_name_label()} required />
        <Select name="visibility" defaultValue="private" aria-label={m.visibility_label()}>
          <option value="private">{m.visibility_private()}</option>
          <option value="public">{m.visibility_public()}</option>
        </Select>
        <Button type="submit" variant="secondary" className="self-end">
          {m.create()}
        </Button>
      </form>

      {publicTotes.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">{m.discover_public()}</h2>
          <ul className="flex flex-col gap-2">
            {publicTotes.map((tote) => (
              <li key={tote.id} className="flex min-h-13 items-center gap-2 rounded-xl border bg-card px-3">
                <span className="min-w-0 flex-1 truncate font-medium">{tote.name}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    toteMembersCollection.insert({
                      id: newId(),
                      tote_id: tote.id,
                      user_id: currentUserId()!,
                      role: 'member',
                      joined_with_code: null,
                    })
                    open(tote)
                  }}
                >
                  {m.join()}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
