/**
 * The six collections the app lives in, all backed by TrailBase record APIs
 * with subscriptions on — every browser of every member sees writes live.
 *
 * They sync UNFILTERED: everything the row-level read rules allow, i.e. all of
 * my totes plus public ones. Per-view filtering (active tote, status, market)
 * happens in TanStack DB live queries — which is what makes the cross-tote
 * overview a plain client-side query.
 *
 * Tote is account-only; the `_authed` layout redirects to /login before any of
 * this is asked to sync, so there is no local-storage branch here.
 */
import { createCollection, type Collection } from '@tanstack/react-db'
import { trailBaseCollectionOptions } from '@tanstack/trailbase-db-collection'

import { client } from '#/lib/auth'
import type { Unit } from '#/lib/classify/units'

export type Visibility = 'private' | 'public'
export type Role = 'owner' | 'member'
export type Status = 'new' | 'buy' | 'bought'

export interface ToteRow {
  id: string
  created_by?: string | null
  name: string
  visibility: Visibility
  /** Join secret for private totes; null = link joining disabled. */
  invite_code?: string | null
  created_at?: number
  updated_at?: number
}

export interface ToteMemberRow {
  id: string
  tote_id: string
  user_id: string
  role: Role
  /** Proof-of-invite the CREATE access rule checked; audit trail only. */
  joined_with_code?: string | null
  created_at?: number
}

/** Catalog entity: owned by its creator, attached to totes via tote_markets. */
export interface MarketRow {
  id: string
  created_by?: string | null
  name: string
  classification_hint: string
  created_at?: number
  updated_at?: number
}

/** Catalog entity: nested category of a market. */
export interface DepartmentRow {
  id: string
  market_id: string
  created_by?: string | null
  name: string
  classification_hint: string
  sort: number
  auto_created: number
  created_at?: number
}

/** The attach: which markets a tote uses, and in what order. */
export interface ToteMarketRow {
  id: string
  tote_id: string
  market_id: string
  sort: number
  created_at?: number
}

export interface ItemRow {
  id: string
  tote_id: string
  created_by?: string | null
  market_id?: string | null
  department_id?: string | null
  title: string
  number?: number | null
  unit?: Unit | null
  description: string
  price_cents?: number | null
  status: Status
  bought_at?: number | null
  bought_by?: string | null
  /** Fractional drag-and-drop rank within the item's display bucket. */
  sort: number
  created_at?: number
  updated_at?: number
}

function openCollection<T extends { id: string }>(name: string): Collection<T, string> {
  return createCollection(
    trailBaseCollectionOptions<T>({
      id: name,
      recordApi: client.records<T>(name),
      getKey: (row) => row.id,
      /*
        No conversions: the row type IS the record type. For a concrete row
        that makes both maps provably empty, but not for a type variable, so
        the cast is what carries that fact through the generic.
      */
      parse: {} as never,
      serialize: {} as never,
    }),
  ) as Collection<T, string>
}

export const totesCollection = openCollection<ToteRow>('totes')
export const toteMembersCollection = openCollection<ToteMemberRow>('tote_members')
export const marketsCollection = openCollection<MarketRow>('markets')
export const departmentsCollection = openCollection<DepartmentRow>('departments')
export const toteMarketsCollection = openCollection<ToteMarketRow>('tote_markets')
export const itemsCollection = openCollection<ItemRow>('items')
