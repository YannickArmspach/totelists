/**
 * A member's face, or failing that a deterministic colored initial.
 *
 * TrailBase serves uploaded avatars at /api/auth/v1/avatar/:userId (users
 * upload theirs on the hosted profile page, /_/auth/profile). Most household
 * members won't bother, so the fallback carries the identity: hue hashed from
 * the user id, letter from their position in the member list.
 */
import { useState } from 'react'

import { TRAILBASE_URL } from '#/lib/auth'
import { cn } from '#/lib/utils'

function hueOf(userId: string): number {
  let hash = 0
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return hash
}

export function Avatar({
  userId,
  label,
  size = 'md',
  className,
}: {
  userId: string
  /** One or two characters; the member's initial. */
  label: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const dimensions = size === 'sm' ? 'size-5 text-[10px]' : 'size-7 text-xs'

  if (broken) {
    return (
      <span
        className={cn(
          'grid shrink-0 place-items-center rounded-full font-semibold text-white',
          dimensions,
          className,
        )}
        style={{ backgroundColor: `oklch(0.55 0.12 ${hueOf(userId)})` }}
        title={label}
      >
        {label}
      </span>
    )
  }

  return (
    <img
      src={`${TRAILBASE_URL}/api/auth/v1/avatar/${encodeURIComponent(userId)}`}
      onError={() => setBroken(true)}
      alt={label}
      className={cn('shrink-0 rounded-full object-cover', dimensions, className)}
    />
  )
}
