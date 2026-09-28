/**
 * One aggregate answer to "is what I'm looking at current?" for the header
 * indicator:
 *
 * - 'offline'  — the browser says there is no network; writes will queue as
 *                optimistic state and nothing arrives from other members.
 * - 'syncing'  — a resync is running or some collection is (re)loading.
 * - 'error'    — a collection failed to sync; a manual resync may recover it.
 * - 'live'     — every collection is ready and streaming.
 */
import { useSyncExternalStore } from 'react'

import {
  departmentsCollection,
  itemsCollection,
  marketsCollection,
  toteInvitesCollection,
  toteMarketsCollection,
  toteMembersCollection,
  totesCollection,
} from './collections'
import { isResyncing, onResyncChange } from './resync'

export type SyncStatus = 'live' | 'syncing' | 'offline' | 'error'

const ALL_COLLECTIONS = [
  totesCollection,
  toteMembersCollection,
  toteInvitesCollection,
  marketsCollection,
  departmentsCollection,
  toteMarketsCollection,
  itemsCollection,
] as const

const listeners = new Set<() => void>()
let current: SyncStatus = 'syncing'
let wired = false

function compute(): SyncStatus {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline'
  if (isResyncing()) return 'syncing'
  const statuses = ALL_COLLECTIONS.map((collection) => collection.status)
  if (statuses.some((status) => status === 'error')) return 'error'
  if (statuses.every((status) => status === 'ready')) return 'live'
  return 'syncing'
}

function refresh(): void {
  const next = compute()
  if (next === current) return
  current = next
  for (const listener of listeners) listener()
}

function wire(): void {
  if (wired || typeof window === 'undefined') return
  wired = true
  for (const collection of ALL_COLLECTIONS) collection.on('status:change', refresh)
  window.addEventListener('online', refresh)
  window.addEventListener('offline', refresh)
  onResyncChange(refresh)
  current = compute()
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (onChange) => {
      wire()
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => {
      // Events cover the transitions they know about; a cheap recompute on
      // every read covers the ones they don't.
      const next = compute()
      if (next !== current) current = next
      return current
    },
    () => 'syncing' as const, // The server can't know; first client paint corrects it.
  )
}
