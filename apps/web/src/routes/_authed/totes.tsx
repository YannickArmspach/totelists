/**
 * My totes, in the order I dragged them into, and the public totes anyone
 * may join.
 */
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus, Settings } from 'lucide-react'

import { toteMembersCollection, totesCollection, type ToteRow } from '#/db/collections'
import { useMyTotes, usePublicTotes } from '#/db/hooks'
import { currentUserId } from '#/lib/auth'
import { newId } from '#/db/ids'
import { useActiveTote } from '#/stores/active-tote'
import { SortableList } from '#/components/sortable-list'
import { Button } from '#/components/ui/button'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/totes')({ component: TotesPage })

function TotesPage() {
  const totes = useMyTotes()
  const publicTotes = usePublicTotes()
  const { activeToteId, setActiveTote } = useActiveTote()
  const navigate = useNavigate()

  const open = (tote: ToteRow) => {
    setActiveTote(tote.id)
    void navigate({ to: '/tote/$toteId', params: { toteId: tote.id } })
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{m.my_totes()}</h1>

      <SortableList
        items={totes}
        onReorder={(ordered) => {
          // A short list, so renumbering all of it beats fractional ranking.
          ordered.forEach((tote, index) => {
            if (tote.sort === index + 1) return
            totesCollection.update(tote.id, (draft) => {
              draft.sort = index + 1
            })
          })
        }}
        renderItem={(tote) => (
          <div className="flex min-h-13 items-center gap-2 rounded-xl border bg-card px-3">
            <button type="button" onClick={() => open(tote)} className="min-w-0 flex-1 py-2 text-left">
              <span className="font-medium">{tote.name}</span>
              {tote.id === activeToteId && <span className="ml-2 text-primary">●</span>}
              <span className="ml-2 text-xs text-muted-foreground">
                {tote.visibility === 'public' ? m.visibility_public() : m.visibility_private()}
              </span>
            </button>
            <Link
              to="/tote/$toteId/edit"
              params={{ toteId: tote.id }}
              aria-label={m.tote_settings()}
              className="grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
            >
              <Settings className="size-4" />
            </Link>
          </div>
        )}
      />

      <Link
        to="/tote/new"
        className="flex min-h-13 items-center justify-center gap-1.5 rounded-xl border border-dashed text-sm font-medium text-muted-foreground hover:bg-secondary"
      >
        <Plus className="size-4" />
        {m.new_tote()}
      </Link>

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
