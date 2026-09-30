/**
 * Record ids in URLs, minus the padding.
 *
 * Ids are the 16 bytes of a UUIDv7 in base64url (see db/ids.ts), which is
 * always 24 characters ending in exactly `==`. Those two characters are the
 * only thing wrong with the URLs: the router percent-encodes them, so a tote
 * reads `/tote/AaDoNrIBeu2LdM7tACTyHw%3D%3D`.
 *
 * The padding cannot simply be dropped — TrailBase 0.33 answers 400 to an
 * unpadded id (and to standard base64, hence base64url in the first place).
 * So this is a display encoding, applied ONLY at the router boundary through
 * each route's `params: { parse, stringify }`. Everything else — collections,
 * access rules, the persisted activeToteId — keeps passing the canonical
 * padded id and never knows this file exists.
 */

/** Canonical id → the form that goes in a URL. */
export function toUrlId(id: string): string {
  return id.endsWith('==') ? id.slice(0, -2) : id
}

/** URL form → the canonical id the record API expects. */
export function fromUrlId(urlId: string): string {
  return urlId.length === 22 ? `${urlId}==` : urlId
}
