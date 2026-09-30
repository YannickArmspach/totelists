/**
 * Creating a tote: the row, plus the creator's own owner membership.
 *
 * The two inserts must not race. tote_members' CREATE rule proves the creator
 * is allowed in with `EXISTS(SELECT 1 FROM totes WHERE id = _REQ_.tote_id AND
 * created_by = _USER_.id)`, and separate collections flush as independent
 * transactions — so if the membership POST lands first TrailBase 403s it and
 * the tote is left ownerless, which then 403s every item written into it.
 * Hence the await.
 *
 * That await is only survivable because the totes read rule starts with
 * `_ROW_.created_by = _USER_.id` (config.textproto): the adapter resolves
 * isPersisted when the new row comes back on the subscription, and a rule that
 * could not see a member-less tote made this hang for the full 120 s timeout.
 */
import { toteMembersCollection, totesCollection, type ToteRow } from '#/db/collections'
import { currentUserId } from '#/lib/auth'
import { newId, newInviteCode } from '#/db/ids'

export interface NewToteFields {
  name: string
  description?: string
  visibility: ToteRow['visibility']
  /** Where it lands in the list; the caller knows how many there already are. */
  sort?: number
}

export async function createTote(fields: NewToteFields): Promise<ToteRow> {
  const userId = currentUserId()
  const tote: ToteRow = {
    id: newId(),
    created_by: userId,
    name: fields.name,
    description: fields.description ?? '',
    visibility: fields.visibility,
    sort: fields.sort ?? 0,
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
