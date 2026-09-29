/**
 * Realtime sync recovery — the triggers, not the mechanism.
 *
 * The repair itself lives in db/subscribe.ts: a dead subscription stream
 * reconnects in place and replays the gap as change events, so collections are
 * never stopped and never cleared. That matters — a collection's cleanup()
 * marks every live query depending on it FATALLY errored in TanStack DB, and
 * restarting sync does not clear it, so the old stop-and-restart resync left
 * the UI permanently frozen on its last snapshot.
 *
 * What is left here is knowing WHEN the streams are worth doubting: the page
 * came back from the background, the network returned, the bfcache restored a
 * page whose every connection is long dead.
 */
import { isRecovering, onRecoveringChange, refreshAllStreams } from './subscribe'

/** True while any stream is reconnecting or replaying what it missed. */
export function isResyncing(): boolean {
  return isRecovering()
}

/** Fires when a resync starts or ends — the sync indicator listens. */
export function onResyncChange(listener: () => void): void {
  onRecoveringChange(listener)
}

/**
 * Drop every live stream so each reconnects and catches up. Returns once the
 * refresh is under way; the sync indicator follows `isResyncing()` from there.
 */
export function resyncAll(): void {
  refreshAllStreams()
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
    if (hiddenAt && Date.now() - hiddenAt >= HIDDEN_THRESHOLD_MS) resyncAll()
  })

  // Back online: whatever streams existed did not survive the gap.
  window.addEventListener('online', () => resyncAll())

  // Restored from the back/forward cache: the page state is a snapshot from
  // before navigation and every stream in it is long dead.
  window.addEventListener('pageshow', (event) => {
    if ((event as PageTransitionEvent).persisted) resyncAll()
  })
}
