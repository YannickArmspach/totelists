/**
 * The "connection lost" modal. Appears when the sync status degrades to
 * offline or error, offers a reconnect (a forced resync), and allows carrying
 * on offline — the list is still readable and writes queue optimistically.
 * Once dismissed it stays away until the connection has actually recovered
 * and dropped again, so a long offline stretch isn't an endless nag.
 */
import { useEffect, useState } from 'react'
import { CloudOff } from 'lucide-react'

import { resyncAll } from '#/db/resync'
import { useSyncStatus } from '#/db/sync-status'
import { Button } from '#/components/ui/button'
import { Dialog } from '#/components/ui/dialog'
import { m } from '#/paraglide/messages'

export function ConnectionLostModal() {
  const status = useSyncStatus()
  const [dismissed, setDismissed] = useState(false)

  const lost = status === 'offline' || status === 'error'

  // A real recovery re-arms the modal for the next drop.
  useEffect(() => {
    if (status === 'live') setDismissed(false)
  }, [status])

  if (!lost || dismissed) return null

  return (
    <Dialog open onClose={() => setDismissed(true)}>
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-secondary">
          <CloudOff className="size-6 text-amber-600" />
        </span>
        <h2 className="text-lg font-semibold">{m.connection_lost_title()}</h2>
        <p className="text-sm text-muted-foreground">
          {status === 'offline' ? m.connection_lost_body() : m.sync_error()}
        </p>
        <div className="flex w-full flex-col gap-2 pt-1">
          <Button size="lg" onClick={() => void resyncAll()}>
            {m.reconnect()}
          </Button>
          <Button variant="ghost" onClick={() => setDismissed(true)}>
            {m.continue_offline()}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
