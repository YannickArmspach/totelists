/**
 * Live reads of the seven collections.
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
  marketDepartmentsCollection,
  marketsCollection,
  toteInvitesCollection,
  toteMembersCollection,
  totesCollection,
  type DepartmentRow,
  type ItemRow,
  type MarketDepartmentRow,
  type MarketRow,
  type ToteInviteRow,
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
const NO_MARKET_DEPARTMENTS: MarketDepartmentRow[] = []

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

function useMarketDepartmentRows() {
  return useLiveQuery({ query: (q) => q.from({ rows: marketDepartmentsCollection }) })
}

function useItemRows() {
  return useLiveQuery({ query: (q) => q.from({ items: itemsCollection }) })
}

/** The totes I'm a member of, in the order the user arranged them. */
export function useMyTotes(): ToteRow[] {
  const hydrated = useHydrated()
  const user = useUser()
  const { data: totes } = useToteRows()
  const { data: members } = useMemberRows()
  return useMemo(() => {
    if (!hydrated || !user) return NO_TOTES
    const mine = new Set(members.filter((row) => row.user_id === user.id).map((row) => row.tote_id))
    return totes
      .filter((tote) => mine.has(tote.id))
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id.localeCompare(b.id))
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

const NO_INVITES: ToteInviteRow[] = []

function useInviteRows() {
  return useLiveQuery({ query: (q) => q.from({ invites: toteInvitesCollection }) })
}

/** Pending invitations of one tote — the settings page's revoke list. */
export function useToteInvites(toteId: string | null | undefined): ToteInviteRow[] {
  const hydrated = useHydrated()
  const { data } = useInviteRows()
  return useMemo(
    () =>
      hydrated && toteId
        ? data.filter((row) => row.tote_id === toteId).sort((a, b) => a.id.localeCompare(b.id))
        : NO_INVITES,
    [hydrated, data, toteId],
  )
}

/** Invitations addressed to MY account email, for totes I'm not in yet. */
export function useMyInvites(): ToteInviteRow[] {
  const hydrated = useHydrated()
  const user = useUser()
  const { data: invites } = useInviteRows()
  const { data: members } = useMemberRows()
  return useMemo(() => {
    const email = user?.email?.toLowerCase()
    const userId = user?.id
    if (!hydrated || !email || !userId) return NO_INVITES
    const mine = new Set(members.filter((row) => row.user_id === userId).map((row) => row.tote_id))
    return invites.filter((row) => row.email.toLowerCase() === email && !mine.has(row.tote_id))
  }, [hydrated, user, invites, members])
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

export interface MarketWithDepartments {
  market: MarketRow
  departments: DepartmentRow[]
}

/** A market's departments, in that market's order. */
export function useMarketDepartments(marketId: string | null | undefined): DepartmentRow[] {
  const hydrated = useHydrated()
  const { data: departments } = useDepartmentRows()
  const { data: marketDepartments } = useMarketDepartmentRows()
  return useMemo(() => {
    if (!hydrated || !marketId) return NO_DEPARTMENTS
    const departmentById = new Map(departments.map((dept) => [dept.id, dept]))
    return marketDepartments
      .filter((row) => row.market_id === marketId)
      .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
      .flatMap((row) => {
        const dept = departmentById.get(row.department_id)
        return dept ? [dept] : []
      })
  }, [hydrated, marketId, departments, marketDepartments])
}

/** A market's attach rows, in order — what the sortable selector edits. */
export function useMarketDepartmentRowsFor(
  marketId: string | null | undefined,
): MarketDepartmentRow[] {
  const hydrated = useHydrated()
  const { data } = useMarketDepartmentRows()
  return useMemo(
    () =>
      hydrated && marketId
        ? data
            .filter((row) => row.market_id === marketId)
            .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
        : NO_MARKET_DEPARTMENTS,
    [hydrated, data, marketId],
  )
}

/** Every market↔department attach row this user can see. */
export function useAllMarketDepartments(): MarketDepartmentRow[] {
  const hydrated = useHydrated()
  const { data } = useMarketDepartmentRows()
  return hydrated ? data : NO_MARKET_DEPARTMENTS
}

/** Every reusable preset (never the market-local custom ones), name-sorted. */
export function useDepartmentPresets(): DepartmentRow[] {
  const hydrated = useHydrated()
  const { data } = useDepartmentRows()
  return useMemo(
    () =>
      hydrated
        ? data
            .filter((dept) => !dept.owner_market_id)
            .sort((a, b) => a.name.localeCompare(b.name))
        : NO_DEPARTMENTS,
    [hydrated, data],
  )
}

/** One department by id, preset or custom. */
export function useDepartment(departmentId: string | null | undefined): DepartmentRow | undefined {
  const { data } = useDepartmentRows()
  return departmentId ? data.find((dept) => dept.id === departmentId) : undefined
}

/** Which markets use a department — the preset list's usage line. */
export function useDepartmentUsage(departmentId: string | null | undefined): MarketDepartmentRow[] {
  const hydrated = useHydrated()
  const { data } = useMarketDepartmentRows()
  return useMemo(
    () =>
      hydrated && departmentId
        ? data.filter((row) => row.department_id === departmentId)
        : NO_MARKET_DEPARTMENTS,
    [hydrated, data, departmentId],
  )
}

/** Every market this user can see, in the account's chosen order. */
export function useCatalogMarkets(): MarketRow[] {
  const hydrated = useHydrated()
  const { data } = useMarketRows()
  return useMemo(
    () =>
      hydrated
        ? [...data].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name))
        : NO_MARKETS,
    [hydrated, data],
  )
}

/** Every market with its departments, in order — what the list views need. */
export function useMarketsWithDepartments(): MarketWithDepartments[] {
  const markets = useCatalogMarkets()
  const { data: departments } = useDepartmentRows()
  const { data: marketDepartments } = useMarketDepartmentRows()
  return useMemo(() => {
    const departmentById = new Map(departments.map((dept) => [dept.id, dept]))
    return markets.map((market) => ({
      market,
      departments: marketDepartments
        .filter((row) => row.market_id === market.id)
        .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
        .flatMap((row) => {
          const dept = departmentById.get(row.department_id)
          return dept ? [dept] : []
        }),
    }))
  }, [markets, departments, marketDepartments])
}

export function useToteItems(toteId: string | null | undefined): ItemRow[] {
  const hydrated = useHydrated()
  const { data } = useItemRows()
  return useMemo(
    () => (hydrated && toteId ? data.filter((item) => item.tote_id === toteId) : NO_ITEMS),
    [hydrated, data, toteId],
  )
}

/** Everything readable, for cross-tote counts and suggestion mining. */
export function useAllItems(): ItemRow[] {
  const hydrated = useHydrated()
  const { data } = useItemRows()
  return useMemo(() => (hydrated ? data : NO_ITEMS), [hydrated, data])
}

/** The active tote's catalog, in the wire shape /api/classify expects. */
export function useClassifyMarkets(): ClassifyMarket[] {
  const entries = useMarketsWithDepartments()
  return useMemo(
    () =>
      entries.map(({ market, departments }) => ({
        id: market.id,
        name: market.name,
        classification_hint: market.classification_hint,
        departments: departments.map((dept) => ({
          id: dept.id,
          name: dept.name,
          classification_hint: dept.classification_hint,
        })),
      })),
    [entries],
  )
}
