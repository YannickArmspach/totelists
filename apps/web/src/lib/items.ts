/**
 * Pure item logic: status transitions, grouping, suggestions, drag ranking.
 * No collection access here — callers apply the returned patches — which is
 * what makes every rule below unit-testable.
 */
import type { DepartmentRow, ItemRow } from '#/db/collections'

export interface ItemPatch {
  status?: ItemRow['status']
  bought_at?: number | null
  bought_by?: string | null
  updated_at?: number
}

/** Inbox → shopping list. */
export function promote(now: number = epoch()): ItemPatch {
  return { status: 'buy', updated_at: now }
}

/** Checked off in the aisle: remember when and by whom. */
export function checkOff(userId: string, now: number = epoch()): ItemPatch {
  return { status: 'bought', bought_at: now, bought_by: userId, updated_at: now }
}

/** Back onto the list; the purchase never happened. */
export function undoCheckOff(now: number = epoch()): ItemPatch {
  return { status: 'buy', bought_at: null, bought_by: null, updated_at: now }
}

function epoch(): number {
  return Math.floor(Date.now() / 1000)
}

// ---------------------------------------------------------------------------
// Grouping

export interface DepartmentGroup {
  /** null = the "Other" bucket: items with no (valid) department. */
  department: DepartmentRow | null
  items: ItemRow[]
}

const bySort = (a: { sort: number }, b: { sort: number }) => a.sort - b.sort

/**
 * A market page's sections: departments that HAVE items here (emergent — a
 * tote never lists a department it isn't using), in department sort order,
 * the no-department bucket last. Items inside follow their own dnd rank.
 */
export function groupByDepartment(items: ItemRow[], departments: DepartmentRow[]): DepartmentGroup[] {
  const byId = new Map(departments.map((d) => [d.id, d]))
  const buckets = new Map<string | null, ItemRow[]>()

  for (const item of items) {
    const dept = item.department_id ? (byId.get(item.department_id) ?? null) : null
    const key = dept?.id ?? null
    const bucket = buckets.get(key)
    if (bucket) bucket.push(item)
    else buckets.set(key, [item])
  }

  const groups: DepartmentGroup[] = []
  for (const dept of [...departments].sort(bySort)) {
    const bucket = buckets.get(dept.id)
    if (bucket) groups.push({ department: dept, items: bucket.sort(bySort) })
  }
  const rest = buckets.get(null)
  if (rest) groups.push({ department: null, items: rest.sort(bySort) })
  return groups
}

/**
 * Quick re-add: the titles most often bought in this tote+market, minus those
 * already back on the list. Case-insensitive so "Tomates" and "tomates" count
 * as one habit.
 */
export function topBoughtTitles(
  items: ItemRow[],
  toteId: string,
  marketId: string | null,
  limit = 8,
): string[] {
  const counts = new Map<string, { title: string; count: number; last: number }>()
  const active = new Set<string>()

  for (const item of items) {
    if (item.tote_id !== toteId) continue
    if ((item.market_id ?? null) !== marketId) continue
    const key = item.title.trim().toLowerCase()
    if (!key) continue
    if (item.status === 'bought') {
      const entry = counts.get(key)
      if (entry) {
        entry.count += 1
        entry.last = Math.max(entry.last, item.bought_at ?? 0)
      } else {
        counts.set(key, { title: item.title.trim(), count: 1, last: item.bought_at ?? 0 })
      }
    } else {
      active.add(key)
    }
  }

  return [...counts.entries()]
    .filter(([key]) => !active.has(key))
    .sort(([, a], [, b]) => b.count - a.count || b.last - a.last)
    .slice(0, limit)
    .map(([, entry]) => entry.title)
}

// ---------------------------------------------------------------------------
// Drag-and-drop ranking (fractional)

/** Gap below which midpoints stop being distinct floats worth trusting. */
const MIN_GAP = 1e-6

/**
 * The rank for an item dropped between two neighbors (either side may be
 * absent: dropped first/last/into an empty bucket). Returns NaN when the gap
 * has collapsed — the caller rebalances the bucket and tries again.
 */
export function sortBetween(prev: number | undefined, next: number | undefined): number {
  if (prev === undefined && next === undefined) return 1
  if (prev === undefined) return next! - 1
  if (next === undefined) return prev + 1
  const mid = (prev + next) / 2
  if (next - prev < MIN_GAP || mid <= prev || mid >= next) return Number.NaN
  return mid
}

/** Fresh whole-number ranks for a bucket whose gaps have collapsed. */
export function rebalanceBucket(items: ItemRow[]): Array<{ id: string; sort: number }> {
  return [...items].sort(bySort).map((item, index) => ({ id: item.id, sort: index + 1 }))
}

/** The rank for an item appended to the end of a bucket. */
export function sortAtEnd(items: ItemRow[]): number {
  let max = 0
  for (const item of items) if (item.sort > max) max = item.sort
  return max + 1
}
