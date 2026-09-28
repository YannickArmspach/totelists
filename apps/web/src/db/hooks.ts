/**
 * Live reads of the six collections.
 *
 * The collections sync unfiltered (everything the access rules allow); these
 * hooks do the per-view filtering in plain JS over live query results, which
 * keeps every rule readable and unit-testable. At household scale the arrays
 * are small; nothing here needs an index.
 */
import { useLiveQuery } from '@tanstack/react-db'
import { useEffect, useMemo, useState } from 'react'

import { useUser } from '#/lib/auth'
import type { ClassifyMarket } from '#/lib/classify/schema'
import {
  departmentsCollection,
  itemsCollection,
  marketsCollection,
  toteMarketsCollection,
  toteMembersCollection,
  totesCollection,
  type DepartmentRow,
  type ItemRow,
  type MarketRow,
  type ToteMarketRow,
  type ToteMemberRow,
  type ToteRow,
} from './collections'

/**
 * False for the render that hydrates, true from the first effect onwards —
 * keeps the first client render identical to the server's empty one.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return hydrated
}

const NO_TOTES: ToteRow[] = []
const NO_MEMBERS: ToteMemberRow[] = []
const NO_ITEMS: ItemRow[] = []
const NO_MARKETS: MarketRow[] = []
const NO_DEPARTMENTS: DepartmentRow[] = []

function useToteRows() {
  return useLiveQuery({ query: (q) => q.from({ totes: totesCollection }) })
}

function useMemberRows() {
  return useLiveQuery({ query: (q) => q.from({ members: toteMembersCollection }) })
}

function useMarketRows() {
  return useLiveQuery({ query: (q) => q.from({ markets: marketsCollection }) })
}

function useDepartmentRows() {
  return useLiveQuery({ query: (q) => q.from({ departments: departmentsCollection }) })
}

function useAttachmentRows() {
  return useLiveQuery({ query: (q) => q.from({ attachments: toteMarketsCollection }) })
}

function useItemRows() {
  return useLiveQuery({ query: (q) => q.from({ items: itemsCollection }) })
}

/** The totes I'm a member of, oldest first (ids sort by creation). */
export function useMyTotes(): ToteRow[] {
  const hydrated = useHydrated()
  const user = useUser()
  const { data: totes } = useToteRows()
  const { data: members } = useMemberRows()
  return useMemo(() => {
    if (!hydrated || !user) return NO_TOTES
    const mine = new Set(members.filter((row) => row.user_id === user.id).map((row) => row.tote_id))
    return totes.filter((tote) => mine.has(tote.id)).sort((a, b) => a.id.localeCompare(b.id))
  }, [hydrated, user, totes, members])
}

/** Public totes I'm NOT in — the "discover" list. */
export function usePublicTotes(): ToteRow[] {
  const hydrated = useHydrated()
  const user = useUser()
  const { data: totes } = useToteRows()
  const { data: members } = useMemberRows()
  return useMemo(() => {
    if (!hydrated) return NO_TOTES
    const mine = new Set(
      members.filter((row) => row.user_id === user?.id).map((row) => row.tote_id),
    )
    return totes
      .filter((tote) => tote.visibility === 'public' && !mine.has(tote.id))
      .sort((a, b) => a.id.localeCompare(b.id))
  }, [hydrated, user, totes, members])
}

export function useTote(toteId: string | null | undefined): ToteRow | undefined {
  const hydrated = useHydrated()
  const { data } = useToteRows()
  return useMemo(
    () => (hydrated && toteId ? data.find((tote) => tote.id === toteId) : undefined),
    [hydrated, data, toteId],
  )
}

export function useToteMembers(toteId: string | null | undefined): ToteMemberRow[] {
  const hydrated = useHydrated()
  const { data } = useMemberRows()
  return useMemo(
    () =>
      hydrated && toteId
        ? data.filter((row) => row.tote_id === toteId).sort((a, b) => a.id.localeCompare(b.id))
        : NO_MEMBERS,
    [hydrated, data, toteId],
  )
}

export function useMyMembership(toteId: string | null | undefined): ToteMemberRow | undefined {
  const user = useUser()
  const members = useToteMembers(toteId)
  return members.find((row) => row.user_id === user?.id)
}

/**
 * A stable initial per member (A, B, C… by join order). The record API never
 * exposes other members' emails, so a letter is the whole name we have.
 */
export function useMemberInitial(toteId: string | null | undefined): (userId: string) => string {
  const members = useToteMembers(toteId)
  return useMemo(() => {
    const index = new Map(members.map((member, i) => [member.user_id, i]))
    return (userId: string) => {
      const i = index.get(userId)
      return i === undefined ? '?' : String.fromCharCode(65 + (i % 26))
    }
  }, [members])
}

export interface AttachedMarket {
  attachment: ToteMarketRow
  market: MarketRow
  departments: DepartmentRow[]
}

/** A tote's attached markets, in per-tote order, with their departments. */
export function useAttachedMarkets(toteId: string | null | undefined): AttachedMarket[] {
  const hydrated = useHydrated()
  const { data: attachments } = useAttachmentRows()
  const { data: markets } = useMarketRows()
  const { data: departments } = useDepartmentRows()
  return useMemo(() => {
    if (!hydrated || !toteId) return []
    const marketById = new Map(markets.map((market) => [market.id, market]))
    return attachments
      .filter((row) => row.tote_id === toteId)
      .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
      .flatMap((attachment) => {
        const market = marketById.get(attachment.market_id)
        if (!market) return []
        return [
          {
            attachment,
            market,
            departments: departments
              .filter((dept) => dept.market_id === market.id)
              .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id)),
          },
        ]
      })
  }, [hydrated, toteId, attachments, markets, departments])
}

/** The catalog markets this user could attach: theirs + reachable ones. */
export function useCatalogMarkets(): MarketRow[] {
  const hydrated = useHydrated()
  const { data } = useMarketRows()
  return useMemo(
    () => (hydrated ? [...data].sort((a, b) => a.name.localeCompare(b.name)) : NO_MARKETS),
    [hydrated, data],
  )
}

export function useMarketDepartments(marketId: string | null | undefined): DepartmentRow[] {
  const hydrated = useHydrated()
  const { data } = useDepartmentRows()
  return useMemo(
    () =>
      hydrated && marketId
        ? data
            .filter((dept) => dept.market_id === marketId)
            .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
        : NO_DEPARTMENTS,
    [hydrated, data, marketId],
  )
}

/** How many totes use a market — drives the "update everywhere / copy" ask. */
export function useMarketUsage(marketId: string | null | undefined): ToteMarketRow[] {
  const hydrated = useHydrated()
  const { data } = useAttachmentRows()
  return useMemo(
    () => (hydrated && marketId ? data.filter((row) => row.market_id === marketId) : []),
    [hydrated, data, marketId],
  )
}

export function useToteItems(toteId: string | null | undefined): ItemRow[] {
  const hydrated = useHydrated()
  const { data } = useItemRows()
  return useMemo(
    () => (hydrated && toteId ? data.filter((item) => item.tote_id === toteId) : NO_ITEMS),
    [hydrated, data, toteId],
  )
}

/** Everything readable, for the cross-tote overview and suggestion mining. */
export function useAllItems(): ItemRow[] {
  const hydrated = useHydrated()
  const { data } = useItemRows()
  return useMemo(() => (hydrated ? data : NO_ITEMS), [hydrated, data])
}

/** The active tote's catalog, in the wire shape /api/classify expects. */
export function useClassifyMarkets(toteId: string | null | undefined): ClassifyMarket[] {
  const attached = useAttachedMarkets(toteId)
  return useMemo(
    () =>
      attached.map(({ market, departments }) => ({
        id: market.id,
        name: market.name,
        classification_hint: market.classification_hint,
        departments: departments.map((dept) => ({
          id: dept.id,
          name: dept.name,
          classification_hint: dept.classification_hint,
        })),
      })),
    [attached],
  )
}
