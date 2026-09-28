/**
 * "You've been invited" — shown to a signed-in user whose account email holds
 * pending invitations. Accepting inserts the membership (clause 4 of the join
 * rule) and consumes the invite; declining just deletes it.
 */
import { Mail } from 'lucide-react'

import { toteInvitesCollection, toteMembersCollection, type ToteInviteRow } from '#/db/collections'
import { useMyInvites, useTote } from '#/db/hooks'
import { currentUserId } from '#/lib/auth'
import { newId } from '#/db/ids'
import { useActiveTote } from '#/stores/active-tote'
import { Button } from '#/components/ui/button'
import { m } from '#/paraglide/messages'

export function InviteBanner() {
  const invites = useMyInvites()
  if (invites.length === 0) return null
  return (
    <div className="flex flex-col gap-2 px-4 pt-3">
      {invites.map((invite) => (
        <InviteCard key={invite.id} invite={invite} />
      ))}
    </div>
  )
}

function InviteCard({ invite }: { invite: ToteInviteRow }) {
  const tote = useTote(invite.tote_id)
  const { setActiveTote } = useActiveTote()

  const accept = () => {
    const userId = currentUserId()
    if (!userId) return
    toteMembersCollection.insert({
      id: newId(),
      tote_id: invite.tote_id,
      user_id: userId,
      role: 'member',
      joined_with_code: null,
    })
    toteInvitesCollection.delete(invite.id)
    setActiveTote(invite.tote_id)
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-accent/40 px-3 py-2">
      <Mail className="size-5 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-sm">
        {m.invited_to({ name: tote?.name ?? '…' })}
      </p>
      <Button variant="ghost" size="sm" onClick={() => toteInvitesCollection.delete(invite.id)}>
        {m.decline()}
      </Button>
      <Button size="sm" onClick={accept}>
        {m.accept()}
      </Button>
    </div>
  )
}
