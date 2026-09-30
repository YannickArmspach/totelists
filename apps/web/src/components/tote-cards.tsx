/**
 * The first four totes, two up, on home — what the header dropdown never
 * managed to say: who's in each tote, what's waiting in it, whether it's
 * private. Order is the one arranged on /totes, so putting a tote first there
 * is what puts it first here. Tap a card to open the tote's page (and make it
 * active); "see all" appears once there are more than fit here. Creating and
 * editing live on the Totes tab.
 *
 * One useAllItems() feeds every count — no per-card queries beyond the
 * members each card already needs for avatars.
 */
import { Link } from '@tanstack/react-router'
import { Lock } from 'lucide-react'

import type { ItemRow, ToteRow } from '#/db/collections'
import { useAllItems, useMemberInitial, useMyTotes, useToteMembers } from '#/db/hooks'
import { useActiveTote } from '#/stores/active-tote'
import { Avatar } from '#/components/avatar'
import { cn } from '#/lib/utils'
import { m } from '#/paraglide/messages'

const MAX_AVATARS = 4

/** How many fit on home before the Totes tab is the better place to look. */
const HOME_TOTES = 4

export function ToteCards() {
  const totes = useMyTotes()
  const { activeToteId, setActiveTote } = useActiveTote()
  const items = useAllItems()

  if (totes.length === 0) return null

  const active = totes.find((tote) => tote.id === activeToteId) ?? totes[0]

  // useMyTotes() is already in the order dragged on /totes, so home shows the
  // first few of that — one order for the app, not a second guessed one.
  const shown = totes.slice(0, HOME_TOTES)
  // The active tote is what Say-it writes into, so it is never cut from home
  // even if four others sit above it.
  if (active && !shown.some((tote) => tote.id === active.id)) {
    shown.splice(HOME_TOTES - 1, 1, active)
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">{m.my_totes()}</h2>
        {totes.length > shown.length && (
          <Link
            to="/totes"
            className="inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-secondary"
          >
            {m.see_all()}
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 empty:hidden">
        {shown.map((tote) => (
          <ToteCard
            key={tote.id}
            tote={tote}
            items={items}
            active={tote.id === active?.id}
            onSelect={() => setActiveTote(tote.id)}
          />
        ))}
      </div>
    </section>
  )
}

function ToteCard({
  tote,
  items,
  active,
  onSelect,
}: {
  tote: ToteRow
  items: ItemRow[]
  active: boolean
  onSelect: () => void
}) {
  const members = useToteMembers(tote.id)
  const initialOf = useMemberInitial(tote.id)

  const mine = items.filter((item) => item.tote_id === tote.id)
  const buy = mine.filter((item) => item.status === 'buy').length
  const toReview = mine.filter((item) => item.status === 'new').length

  const stats =
    m.to_buy_count({ count: buy }) +
    (toReview > 0 ? ` · ${m.to_review_count({ count: toReview })}` : '')

  return (
    <Link
      to="/tote/$toteId"
      params={{ toteId: tote.id }}
      onClick={onSelect}
      aria-current={active}
      className={cn(
        'flex min-h-24 min-w-0 flex-col gap-1 rounded-xl border bg-card p-3 text-left',
        active ? 'border-primary ring-1 ring-primary' : 'hover:bg-secondary',
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {tote.visibility === 'private' && (
          <Lock
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-label={m.visibility_private()}
          />
        )}
        <span className="truncate font-medium">{tote.name}</span>
      </span>
      <span className="min-h-4 truncate text-xs text-muted-foreground">{tote.description}</span>
      {/* Half-width cells are tight: the counts wrap above the faces. */}
      <span className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="truncate text-xs text-muted-foreground">{stats}</span>
        <span className="flex shrink-0 -space-x-1.5">
          {members.slice(0, MAX_AVATARS).map((member) => (
            <Avatar
              key={member.id}
              userId={member.user_id}
              label={initialOf(member.user_id)}
              size="sm"
              className="ring-1 ring-card"
            />
          ))}
          {members.length > MAX_AVATARS && (
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground ring-1 ring-card">
              +{members.length - MAX_AVATARS}
            </span>
          )}
        </span>
      </span>
    </Link>
  )
}
