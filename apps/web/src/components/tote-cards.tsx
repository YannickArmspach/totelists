/**
 * The tote switcher as a horizontal card strip at the top of home — what the
 * header dropdown never managed to say: who's in each tote, what's waiting in
 * it, whether it's private. Tap a card to open the tote's page (and make it
 * active); the gear opens settings without switching; "new tote" next to the
 * section title creates or joins.
 *
 * One useAllItems() feeds every count (the overview-page pattern) — no
 * per-card queries beyond the members each card already needs for avatars.
 */
import { Link } from '@tanstack/react-router'
import { Lock, Plus, Settings } from 'lucide-react'

import type { ItemRow, ToteRow } from '#/db/collections'
import { useAllItems, useMemberInitial, useMyTotes, useToteMembers } from '#/db/hooks'
import { useActiveTote } from '#/stores/active-tote'
import { Avatar } from '#/components/avatar'
import { cn } from '#/lib/utils'
import { m } from '#/paraglide/messages'

const MAX_AVATARS = 4

export function ToteCards() {
  const totes = useMyTotes()
  const { activeToteId, setActiveTote } = useActiveTote()
  const items = useAllItems()

  if (totes.length === 0) return null

  const active = totes.find((tote) => tote.id === activeToteId) ?? totes[0]

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">{m.my_totes()}</h2>
        <Link
          to="/totes"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-secondary"
        >
          <Plus className="size-4" />
          {m.new_tote()}
        </Link>
      </div>
      {/* Full bleed inside the page's px-4, so cards can scroll to the edge. */}
      <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 scrollbar-none">
        {totes.map((tote) => (
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
    /* The gear is a Link overlaid on the card link — nesting it would be invalid HTML. */
    <div className="relative w-64 shrink-0 snap-start">
      <Link
        to="/user-{$userId}/tote-{$toteId}"
        params={{ userId: tote.created_by ?? 'unknown', toteId: tote.id }}
        onClick={onSelect}
        aria-current={active}
        className={cn(
          'flex min-h-24 w-full flex-col gap-1 rounded-xl border bg-card p-3 text-left',
          active ? 'border-primary ring-1 ring-primary' : 'hover:bg-secondary',
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5 pr-9">
          {tote.visibility === 'private' && (
            <Lock
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-label={m.visibility_private()}
            />
          )}
          <span className="truncate font-medium">{tote.name}</span>
        </span>
        <span className="min-h-4 truncate text-xs text-muted-foreground">
          {tote.description}
        </span>
        <span className="flex items-center justify-between gap-2">
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
      <Link
        to="/totes/$toteId/settings"
        params={{ toteId: tote.id }}
        aria-label={m.tote_settings()}
        className="absolute right-1 top-1 grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
      >
        <Settings className="size-4" />
      </Link>
    </div>
  )
}
