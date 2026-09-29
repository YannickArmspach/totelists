/**
 * The header's sync light. Green cloud = live; spinning = syncing; slashed
 * cloud = offline or a sync error. Tapping it forces a full resync — the
 * closest thing a list PWA has to pull-to-refresh.
 */
import { Cloud, CloudOff, RefreshCw } from 'lucide-react'

import { resyncAll } from '#/db/resync'
import { useSyncStatus, type SyncStatus } from '#/db/sync-status'
import { cn } from '#/lib/utils'
import { m } from '#/paraglide/messages'

const LABELS: Record<SyncStatus, () => string> = {
  live: () => m.sync_live(),
  syncing: () => m.sync_syncing(),
  offline: () => m.sync_offline(),
  error: () => m.sync_error(),
}

export function SyncIndicator() {
  const status = useSyncStatus()
  const label = LABELS[status]()

  return (
    <button
      type="button"
      onClick={() => resyncAll()}
      disabled={status === 'syncing'}
      aria-label={label}
      title={label}
      className="relative grid size-10 place-items-center rounded-lg hover:bg-secondary"
    >
      {status === 'syncing' ? (
        <RefreshCw className="size-4 animate-spin text-muted-foreground" />
      ) : status === 'live' ? (
        <Cloud className="size-4 text-primary" />
      ) : (
        <CloudOff
          className={cn('size-4', status === 'offline' ? 'text-amber-600' : 'text-destructive')}
        />
      )}
      {status === 'live' && (
        <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" />
      )}
    </button>
  )
}
