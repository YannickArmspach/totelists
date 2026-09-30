/**
 * Catalog edit flows: attaching, detaching, and diverging from a shared row.
 *
 * Markets and department presets are shared, so editing one in place changes
 * it for everyone using it. Copy-on-write is the way out: clone, then repoint
 * only THIS market (or tote), leaving every other one on the original.
 *
 * There is no transaction across record-API calls, so the order is what keeps
 * a mid-failure harmless: create the copy first, repoint last. Retrying after
 * a partial failure only leaves an orphaned (unattached, invisible) copy.
 */
import {
  departmentsCollection,
  itemsCollection,
  marketDepartmentsCollection,
  type DepartmentRow,
  type ItemRow,
  type MarketDepartmentRow,
} from '#/db/collections'
import { currentUserId } from '#/lib/auth'
import { newId } from '#/db/ids'

export interface DepartmentEdits {
  name?: string
  classification_hint?: string
}

const epoch = () => Math.floor(Date.now() / 1000)

/**
 * Put a department at the end of a market's list.
 *
 * Attaching validates only the market, so this never has to wait for the
 * department row to land first — which is what lets the classifier create a
 * department and attach it in the same tick without deadlocking.
 */
export function attachDepartment(marketId: string, departmentId: string, sort: number): string {
  const id = newId()
  marketDepartmentsCollection.insert({ id, market_id: marketId, department_id: departmentId, sort })
  return id
}

/**
 * Detach a department from one market. A custom department (owned by this
 * market) has nowhere else to live, so it goes too; a preset stays in the
 * catalog for its other markets.
 */
export function detachDepartment(attachment: MarketDepartmentRow, department?: DepartmentRow): void {
  marketDepartmentsCollection.delete(attachment.id)
  if (department?.owner_market_id === attachment.market_id) {
    departmentsCollection.delete(department.id)
  }
}


/**
 * Copy-on-write a department into one market: a custom department owned by
 * that market, replacing it in the market's list, with this tote's items moved
 * over. This is how you diverge from a shared preset without touching the
 * preset itself.
 */
export function copyDepartmentForMarket(
  toteId: string,
  department: DepartmentRow,
  attachment: MarketDepartmentRow,
  items: ItemRow[],
  edits: DepartmentEdits = {},
): string {
  const now = epoch()
  const copy: DepartmentRow = {
    id: newId(),
    created_by: currentUserId(),
    name: edits.name ?? department.name,
    classification_hint: edits.classification_hint ?? department.classification_hint,
    owner_market_id: attachment.market_id,
    auto_created: 0,
  }
  departmentsCollection.insert(copy)

  // The copy takes the original's place, and its position, in this market.
  marketDepartmentsCollection.update(attachment.id, (draft) => {
    draft.department_id = copy.id
  })

  for (const item of items) {
    if (item.tote_id !== toteId || item.department_id !== department.id) continue
    itemsCollection.update(item.id, (draft) => {
      draft.department_id = copy.id
      draft.updated_at = now
    })
  }
  return copy.id
}


