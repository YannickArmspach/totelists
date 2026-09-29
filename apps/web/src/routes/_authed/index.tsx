/**
 * Home: the big Say-it button first (it targets the active tote), the review
 * inbox right under what you just said, then the tote card strip and the
 * market shortcuts. Totes and markets live on their own pages —
 * /user-{ownerId}/tote-{toteId} and /user-{ownerId}/market-{marketId} — a tap
 * away.
 */
import { createFileRoute } from '@tanstack/react-router'

import { toteMembersCollection, totesCollection, type ToteRow } from '#/db/collections'
import { useClassifyMarkets, useHydrated, useMyTotes, useToteItems } from '#/db/hooks'
import { currentUserId } from '#/lib/auth'
import { newId, newInviteCode } from '#/db/ids'
import { useActiveTote } from '#/stores/active-tote'
import { AddIt } from '#/components/add-it'
import { MyMarkets } from '#/components/my-markets'
import { ReviewInbox } from '#/components/review-inbox'
import { ToteCards } from '#/components/tote-cards'
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
    description: '',
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

  const classifyMarkets = useClassifyMarkets(active?.id)
  const items = useToteItems(active?.id)

  if (!hydrated) return null

  if (totes.length === 0) {
    return <FirstTote onCreated={(tote) => setActiveTote(tote.id)} />
  }
  if (!active) return null

  return (
    <div className="flex flex-col gap-8 pt-4">
      <AddIt toteId={active.id} markets={classifyMarkets} />

      <ReviewInbox items={items} />

      <ToteCards />

      <MyMarkets />
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
