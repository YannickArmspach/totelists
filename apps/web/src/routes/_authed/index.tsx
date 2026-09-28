/**
 * Home: the big Say-it button over the active tote, market tiles with their
 * to-buy counts — or, for a tote with no markets, the flat list itself.
 */
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronRight, Store } from 'lucide-react'

import {
  itemsCollection,
  toteMembersCollection,
  totesCollection,
  type ToteRow,
} from '#/db/collections'
import {
  useAttachedMarkets,
  useClassifyMarkets,
  useHydrated,
  useMyTotes,
  useToteItems,
} from '#/db/hooks'
import { currentUserId } from '#/lib/auth'
import { newId, newInviteCode } from '#/db/ids'
import { useActiveTote } from '#/stores/active-tote'
import { AddIt } from '#/components/add-it'
import { ReviewInbox } from '#/components/review-inbox'
import { BoughtToday } from '#/components/bought-today'
import { BuyRow } from '#/components/buy-row'
import { GroupedSortable } from '#/components/grouped-sortable'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/')({ component: HomePage })

/**
 * Create a tote + the creator's own owner row; returns the new tote.
 *
 * The two inserts must not race. tote_members' CREATE rule proves the creator
 * is allowed in with `EXISTS(SELECT 1 FROM totes WHERE id = _REQ_.tote_id AND
 * created_by = _USER_.id)`, and separate collections flush as independent
 * transactions — so if the membership POST lands first TrailBase 403s it and
 * the tote is left ownerless, which then 403s every item written into it.
 * Await the tote before claiming it.
 */
export async function createTote(
  name: string,
  visibility: ToteRow['visibility'],
): Promise<ToteRow> {
  const userId = currentUserId()
  const tote: ToteRow = {
    id: newId(),
    created_by: userId,
    name,
    visibility,
    invite_code: newInviteCode(),
  }
  await totesCollection.insert(tote).isPersisted.promise
  toteMembersCollection.insert({
    id: newId(),
    tote_id: tote.id,
    user_id: userId!,
    role: 'owner',
    joined_with_code: null,
  })
  return tote
}

function HomePage() {
  const hydrated = useHydrated()
  const totes = useMyTotes()
  const { activeToteId, setActiveTote } = useActiveTote()
  const active = totes.find((tote) => tote.id === activeToteId) ?? totes[0]

  const markets = useAttachedMarkets(active?.id)
  const classifyMarkets = useClassifyMarkets(active?.id)
  const items = useToteItems(active?.id)

  if (!hydrated) return null

  if (totes.length === 0) {
    return <FirstTote onCreated={(tote) => setActiveTote(tote.id)} />
  }
  if (!active) return null

  const buyItems = items.filter((item) => item.status === 'buy')
  const buyCount = (marketId: string) =>
    buyItems.filter((item) => item.market_id === marketId).length
  const rootItems = buyItems
    .filter((item) => !item.market_id)
    .sort((a, b) => a.sort - b.sort)

  return (
    <div className="flex flex-col gap-8">
      <div className="pt-4 text-center">
        <h1 className="text-xl font-semibold">{active.name}</h1>
        <p className="text-sm text-muted-foreground">{m.baseline()}</p>
      </div>

      <AddIt toteId={active.id} markets={classifyMarkets} />

      <ReviewInbox items={items} />

      {markets.length > 0 && (
        <section className="flex flex-col gap-2">
          {markets.map(({ market }) => (
            <Link
              key={market.id}
              to="/markets/$marketId"
              params={{ marketId: market.id }}
              className="flex min-h-13 items-center gap-3 rounded-xl border bg-card px-4 hover:bg-secondary"
            >
              <Store className="size-5 text-primary" />
              <span className="min-w-0 flex-1 truncate font-medium">{market.name}</span>
              {buyCount(market.id) > 0 && (
                <span className="rounded-full bg-primary px-2.5 py-0.5 text-sm font-semibold text-primary-foreground">
                  {buyCount(market.id)}
                </span>
              )}
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </section>
      )}

      {rootItems.length > 0 && (
        <section>
          {markets.length > 0 && (
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">{m.no_market()}</h2>
          )}
          <GroupedSortable
            groups={[{ key: 'root', items: rootItems }]}
            onMove={({ updates }) => {
              for (const update of updates) {
                itemsCollection.update(update.id, (draft) => {
                  draft.sort = update.sort
                })
              }
            }}
            renderItem={(item) => <BuyRow item={item} bucket={rootItems} />}
          />
        </section>
      )}

      {markets.length === 0 && rootItems.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">{m.list_empty()}</p>
      )}

      {markets.length === 0 && (
        <BoughtToday toteId={active.id} items={items.filter((item) => !item.market_id)} />
      )}
    </div>
  )
}

function FirstTote({ onCreated }: { onCreated: (tote: ToteRow) => void }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 pt-16 text-center">
      <h1 className="text-2xl font-semibold">{m.first_tote_title()}</h1>
      <p className="text-sm text-muted-foreground">{m.first_tote_hint()}</p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const name = String(new FormData(event.currentTarget).get('name') ?? '').trim()
          if (!name) return
          void createTote(name, 'private').then(onCreated)
        }}
      >
        <Input name="name" placeholder={m.tote_name_label()} required />
        <Button type="submit">{m.create()}</Button>
      </form>
    </div>
  )
}
