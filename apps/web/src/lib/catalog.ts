/**
 * Catalog edit flows.
 *
 * Markets/departments are shared catalog entities, so an in-place UPDATE is
 * only the creator's to make ("update everywhere"). Everyone else — and a
 * creator who chooses "copy for this tote" — goes through copy-on-write:
 * clone, then repoint THIS tote's attachment and items, leaving every other
 * tote on the original.
 *
 * There is no transaction across record-API calls, so the order is what keeps
 * a mid-failure harmless: create the copies first, repoint last. Retrying the
 * whole call after a partial failure only leaves an orphaned (unattached,
 * invisible) copy behind.
 */
import {
  departmentsCollection,
  itemsCollection,
  marketsCollection,
  toteMarketsCollection,
  type DepartmentRow,
  type ItemRow,
  type MarketRow,
  type ToteMarketRow,
} from '#/db/collections'
import { currentUserId } from '#/lib/auth'
import { newId } from '#/db/ids'

export interface MarketEdits {
  name?: string
  classification_hint?: string
}

export interface DepartmentEdits {
  name?: string
  classification_hint?: string
  sort?: number
}

const epoch = () => Math.floor(Date.now() / 1000)

/** Every id the caller needs to know about the clone. */
export interface MarketCopy {
  marketId: string
  /** original department id → clone department id */
  departments: Map<string, string>
}

/**
 * Copy-on-write a market for one tote: clone it (with `edits` applied) and its
 * departments, repoint the tote's attachment, then move the tote's items over.
 */
export function copyMarketForTote(
  toteId: string,
  market: MarketRow,
  departments: DepartmentRow[],
  attachment: ToteMarketRow,
  items: ItemRow[],
  edits: MarketEdits = {},
): MarketCopy {
  const userId = currentUserId()
  const now = epoch()

  const marketCopy: MarketRow = {
    id: newId(),
    created_by: userId,
    name: edits.name ?? market.name,
    classification_hint: edits.classification_hint ?? market.classification_hint,
  }
  marketsCollection.insert(marketCopy)

  const departmentIdMap = new Map<string, string>()
  for (const dept of departments) {
    const copy: DepartmentRow = {
      id: newId(),
      market_id: marketCopy.id,
      created_by: userId,
      name: dept.name,
      classification_hint: dept.classification_hint,
      sort: dept.sort,
      auto_created: dept.auto_created,
    }
    departmentIdMap.set(dept.id, copy.id)
    departmentsCollection.insert(copy)
  }

  // Copies exist; from here on every step only repoints THIS tote.
  toteMarketsCollection.update(attachment.id, (draft) => {
    draft.market_id = marketCopy.id
  })

  for (const item of items) {
    if (item.tote_id !== toteId || item.market_id !== market.id) continue
    itemsCollection.update(item.id, (draft) => {
      draft.market_id = marketCopy.id
      draft.department_id = item.department_id
        ? (departmentIdMap.get(item.department_id) ?? null)
        : null
      draft.updated_at = now
    })
  }

  return { marketId: marketCopy.id, departments: departmentIdMap }
}

/**
 * Copy-on-write a single department: a sibling in the SAME market, owned by
 * the editor, and this tote's items move over to it.
 */
export function copyDepartmentForTote(
  toteId: string,
  department: DepartmentRow,
  items: ItemRow[],
  edits: DepartmentEdits = {},
): string {
  const now = epoch()
  const copy: DepartmentRow = {
    id: newId(),
    market_id: department.market_id,
    created_by: currentUserId(),
    name: edits.name ?? department.name,
    classification_hint: edits.classification_hint ?? department.classification_hint,
    sort: edits.sort ?? department.sort,
    auto_created: 0,
  }
  departmentsCollection.insert(copy)

  for (const item of items) {
    if (item.tote_id !== toteId || item.department_id !== department.id) continue
    itemsCollection.update(item.id, (draft) => {
      draft.department_id = copy.id
      draft.updated_at = now
    })
  }
  return copy.id
}

/**
 * Detach a market from a tote. The tote's items keep their titles but drop
 * back into the unrouted bucket — the market was only ever a grouping.
 */
export function detachMarket(toteId: string, attachment: ToteMarketRow, items: ItemRow[]): void {
  const now = epoch()
  for (const item of items) {
    if (item.tote_id !== toteId || item.market_id !== attachment.market_id) continue
    itemsCollection.update(item.id, (draft) => {
      draft.market_id = null
      draft.department_id = null
      draft.updated_at = now
    })
  }
  toteMarketsCollection.delete(attachment.id)
}

/**
 * Merge one department into another (same market): repoint this tote's items,
 * then delete the source if the caller may (the collection surfaces the ACL
 * error if not).
 */
export function mergeDepartment(
  toteId: string,
  from: DepartmentRow,
  intoId: string,
  items: ItemRow[],
): void {
  const now = epoch()
  for (const item of items) {
    if (item.tote_id !== toteId || item.department_id !== from.id) continue
    itemsCollection.update(item.id, (draft) => {
      draft.department_id = intoId
      draft.updated_at = now
    })
  }
  departmentsCollection.delete(from.id)
}
