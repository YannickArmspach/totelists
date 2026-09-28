/**
 * Realtime sync recovery.
 *
 * The TrailBase collection adapter subscribes to each record API's event
 * stream exactly once; when that stream dies, nothing reconnects and the
 * collection silently stops seeing other members' writes. Streams die all the
 * time in the field — Safari (especially iOS, especially an installed PWA)
 * tears down streaming fetches when the app is backgrounded or the screen
 * locks, the proxy closes idle SSE connections, networks change.
 *
 * TrailBase subscriptions carry no resume cursor, so a reconnect can't replay
 * missed events. The only correct recovery is a full resync: stop the
 * collection, clear it, list again, subscribe again — which is exactly what
 * cleanup() + startSyncImmediate() perform.
 */
import {
  departmentsCollection,
  itemsCollection,
  marketsCollection,
  toteInvitesCollection,
  toteMarketsCollection,
  toteMembersCollection,
  totesCollection,
} from './collections'

const ALL_COLLECTIONS = [
  totesCollection,
  toteMembersCollection,
  toteInvitesCollection,
  marketsCollection,
  departmentsCollection,
  toteMarketsCollection,
  itemsCollection,
] as const

let resyncing = false
const resyncListeners = new Set<() => void>()

export function isResyncing(): boolean {
  return resyncing
}

/** Fires when a resync starts or ends — the sync indicator listens. */
export function onResyncChange(listener: () => void): void {
  resyncListeners.add(listener)
}

function setResyncing(value: boolean): void {
  resyncing = value
  for (const listener of resyncListeners) listener()
}

export async function resyncAll(): Promise<void> {
  if (resyncing) return
  setResyncing(true)
  try {
    await Promise.all(
      ALL_COLLECTIONS.map(async (collection) => {
        await collection.cleanup()
        collection.startSyncImmediate()
      }),
    )
  } catch (error) {
    console.error('resync failed', error)
  } finally {
    setResyncing(false)
  }
}

/**
 * How long the page must have been hidden before a resync is worth its
 * refetch. Short of this, the browser generally kept the streams alive;
 * beyond it — an iOS app switch, a locked phone in a shopping cart — assume
 * they're gone.
 */
const HIDDEN_THRESHOLD_MS = 10_000

let installed = false

export function installResyncOnResume(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  let hiddenAt = 0
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }
    if (hiddenAt && Date.now() - hiddenAt >= HIDDEN_THRESHOLD_MS) {
      void resyncAll()
    }
  })

  // Back online: whatever streams existed did not survive the gap.
  window.addEventListener('online', () => void resyncAll())

  // Restored from the back/forward cache: the page state is a snapshot from
  // before navigation and every stream in it is long dead.
  window.addEventListener('pageshow', (event) => {
    if ((event as PageTransitionEvent).persisted) void resyncAll()
  })
}
