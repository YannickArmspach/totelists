/**
 * A fresh row id.
 *
 * Padded base64url of a UUIDv7's bytes — the form TrailBase accepts for a BLOB
 * primary key, both on the wire and as a client-supplied id. The timestamp
 * prefix also makes ids sort by creation.
 */
export function newId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)

  const ms = Date.now()
  for (let i = 0; i < 6; i++) bytes[i] = Math.floor(ms / 2 ** (8 * (5 - i))) & 0xff
  bytes[6] = (bytes[6]! & 0x0f) | 0x70 // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // RFC 4122 variant

  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  // Padding is not optional: TrailBase rejects an unpadded id as invalid.
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_')
}

/** An invite code: shorter-lived secret, URL-safe, unguessable. */
export function newInviteCode(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
