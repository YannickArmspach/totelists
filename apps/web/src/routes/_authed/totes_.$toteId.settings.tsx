/**
 * One tote's settings: rename, visibility, the invite link (copy/regenerate —
 * regenerating revokes every previously shared link), members, leave/delete.
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Copy, RefreshCw } from 'lucide-react'

import { toteInvitesCollection, toteMembersCollection, totesCollection } from '#/db/collections'
import { useMyMembership, useTote, useToteInvites, useToteMembers } from '#/db/hooks'
import { currentUserId, useUser } from '#/lib/auth'
import { newId, newInviteCode } from '#/db/ids'
import { useActiveTote } from '#/stores/active-tote'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input, Select } from '#/components/ui/input'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/totes_/$toteId/settings')({
  component: ToteSettingsPage,
})

function ToteSettingsPage() {
  const { toteId } = Route.useParams()
  const tote = useTote(toteId)
  const members = useToteMembers(toteId)
  const invites = useToteInvites(toteId)
  const membership = useMyMembership(toteId)
  const user = useUser()
  const navigate = useNavigate()
  const { setActiveTote } = useActiveTote()
  const [copied, setCopied] = useState(false)

  if (!tote) return <p className="pt-8 text-center text-sm text-muted-foreground">{m.not_found()}</p>

  const isOwner = membership?.role === 'owner'
  const siteUrl =
    (import.meta.env.VITE_SITE_URL as string | undefined) ??
    (typeof window !== 'undefined' ? window.location.origin : '')
  const inviteLink = tote.invite_code ? `${siteUrl}/join/${tote.id}/${tote.invite_code}` : null

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{m.tote_settings()}</h1>

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          const name = String(form.get('name') ?? '').trim()
          if (!name || !isOwner) return
          totesCollection.update(tote.id, (draft) => {
            draft.name = name
            draft.visibility = form.get('visibility') === 'public' ? 'public' : 'private'
            draft.updated_at = Math.floor(Date.now() / 1000)
          })
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium">
          {m.tote_name_label()}
          <Input name="name" defaultValue={tote.name} disabled={!isOwner} required />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {m.visibility_label()}
          <Select name="visibility" defaultValue={tote.visibility} disabled={!isOwner}>
            <option value="private">{m.visibility_private()}</option>
            <option value="public">{m.visibility_public()}</option>
          </Select>
        </label>
        {isOwner && (
          <Button type="submit" variant="secondary" className="self-end">
            {m.save()}
          </Button>
        )}
      </form>

      {inviteLink && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">{m.invite_link_title()}</h2>
          <p className="break-all rounded-lg border bg-card p-2 text-xs text-muted-foreground">
            {inviteLink}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(inviteLink)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
            >
              <Copy /> {copied ? m.link_copied() : m.copy_link()}
            </Button>
            {isOwner && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  totesCollection.update(tote.id, (draft) => {
                    draft.invite_code = newInviteCode()
                  })
                }
              >
                <RefreshCw /> {m.regenerate_link()}
              </Button>
            )}
          </div>
          {isOwner && <p className="text-xs text-muted-foreground">{m.regenerate_hint()}</p>}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{m.invite_by_email()}</h2>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const input = event.currentTarget.elements.namedItem('email') as HTMLInputElement
            const email = input.value.trim().toLowerCase()
            if (!email) return
            toteInvitesCollection.insert({
              id: newId(),
              tote_id: tote.id,
              email,
              created_by: currentUserId(),
            })
            input.value = ''
            /*
              The invite already works — it matches the account email in-app.
              The mailto is the notification: the inviter's own mail client,
              prefilled with the join link, since the server sends no mail.
            */
            if (inviteLink) {
              const subject = encodeURIComponent(m.invite_mail_subject({ name: tote.name }))
              const body = encodeURIComponent(m.invite_mail_body({ name: tote.name, link: inviteLink }))
              window.location.href = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`
            }
          }}
        >
          <Input name="email" type="email" placeholder={m.email_label()} required />
          <Button type="submit" variant="secondary">
            {m.invite_cta()}
          </Button>
        </form>
        {invites.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {invites.map((invite) => (
              <li key={invite.id} className="flex min-h-10 items-center gap-2 rounded-lg border bg-card px-3">
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {invite.email}
                </span>
                <Badge variant="outline">{m.invite_pending()}</Badge>
                <Button variant="ghost" size="sm" onClick={() => toteInvitesCollection.delete(invite.id)}>
                  {m.revoke()}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{m.members_title()}</h2>
        <ul className="flex flex-col gap-1.5">
          {members.map((member, index) => (
            <li key={member.id} className="flex min-h-11 items-center gap-2 rounded-lg border bg-card px-3">
              <span className="grid size-7 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                {String.fromCharCode(65 + (index % 26))}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {member.user_id === user?.id ? (user?.email ?? member.user_id) : member.user_id}
              </span>
              {member.role === 'owner' && <Badge variant="outline">{m.owner_badge()}</Badge>}
              {isOwner && member.user_id !== user?.id && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toteMembersCollection.delete(member.id)}
                >
                  {m.remove_member()}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        {membership && !isOwner && (
          <Button
            variant="outline"
            onClick={() => {
              toteMembersCollection.delete(membership.id)
              setActiveTote(null)
              void navigate({ to: '/totes' })
            }}
          >
            {m.leave_tote()}
          </Button>
        )}
        {isOwner && (
          <Button
            variant="destructive"
            onClick={() => {
              totesCollection.delete(tote.id)
              setActiveTote(null)
              void navigate({ to: '/totes' })
            }}
          >
            {m.delete_tote()}
          </Button>
        )}
      </section>
    </div>
  )
}
