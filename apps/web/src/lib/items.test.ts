import { describe, expect, it } from 'vitest'
import type { DepartmentRow, ItemRow } from '#/db/collections'
import {
  checkOff,
  groupByDepartment,
  promote,
  rebalanceBucket,
  sortAtEnd,
  sortBetween,
  topBoughtTitles,
  undoCheckOff,
} from './items'

function item(overrides: Partial<ItemRow>): ItemRow {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    tote_id: 'tote-1',
    title: 'thing',
    description: '',
    status: 'buy',
    sort: 0,
    ...overrides,
  }
}

function dept(id: string, sort: number): DepartmentRow {
  return { id, market_id: 'mkt', name: id, classification_hint: '', sort, auto_created: 0 }
}

describe('status transitions', () => {
  it('promote moves to buy', () => {
    expect(promote(100)).toEqual({ status: 'buy', updated_at: 100 })
  })

  it('checkOff records who and when', () => {
    expect(checkOff('user-1', 100)).toEqual({
      status: 'bought',
      bought_at: 100,
      bought_by: 'user-1',
      updated_at: 100,
    })
  })

  it('undo clears the purchase entirely', () => {
    expect(undoCheckOff(100)).toEqual({
      status: 'buy',
      bought_at: null,
      bought_by: null,
      updated_at: 100,
    })
  })
})

describe('groupByDepartment', () => {
  it('is emergent: only departments with items appear, in sort order, Other last', () => {
    const departments = [dept('d-b', 2), dept('d-a', 1), dept('d-empty', 3)]
    const items = [
      item({ id: '1', department_id: 'd-b', sort: 1 }),
      item({ id: '2', department_id: 'd-a', sort: 1 }),
      item({ id: '3', department_id: null, sort: 1 }),
      item({ id: '4', department_id: 'd-a', sort: 0.5 }),
    ]
    const groups = groupByDepartment(items, departments)
    expect(groups.map((group) => group.department?.id ?? 'other')).toEqual(['d-a', 'd-b', 'other'])
    expect(groups[0]!.items.map((entry) => entry.id)).toEqual(['4', '2'])
  })

  it('sends items pointing at an unknown department to Other', () => {
    const groups = groupByDepartment([item({ department_id: 'ghost' })], [dept('d-a', 1)])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.department).toBeNull()
  })
})

describe('topBoughtTitles', () => {
  const history = [
    item({ status: 'bought', title: 'Tomates', market_id: 'm1', bought_at: 10 }),
    item({ status: 'bought', title: 'tomates', market_id: 'm1', bought_at: 20 }),
    item({ status: 'bought', title: 'Lait', market_id: 'm1', bought_at: 30 }),
    item({ status: 'bought', title: 'Vis', market_id: 'm2', bought_at: 30 }),
  ]

  it('counts case-insensitively, most bought first, scoped to the market', () => {
    expect(topBoughtTitles(history, 'tote-1', 'm1')).toEqual(['Tomates', 'Lait'])
  })

  it('hides titles already back on the list', () => {
    const items = [...history, item({ status: 'buy', title: 'TOMATES', market_id: 'm1' })]
    expect(topBoughtTitles(items, 'tote-1', 'm1')).toEqual(['Lait'])
  })

  it('scopes to the tote', () => {
    expect(topBoughtTitles(history, 'tote-2', 'm1')).toEqual([])
  })
})

describe('drag ranking', () => {
  it('midpoints between neighbors', () => {
    expect(sortBetween(1, 2)).toBe(1.5)
  })

  it('handles the edges of a bucket', () => {
    expect(sortBetween(undefined, 5)).toBe(4)
    expect(sortBetween(3, undefined)).toBe(4)
    expect(sortBetween(undefined, undefined)).toBe(1)
  })

  it('signals a collapsed gap instead of inventing a rank', () => {
    expect(Number.isNaN(sortBetween(1, 1 + 1e-9))).toBe(true)
  })

  it('rebalances a bucket to whole numbers in display order', () => {
    const bucket = [item({ id: 'a', sort: 3 }), item({ id: 'b', sort: 1 }), item({ id: 'c', sort: 2 })]
    expect(rebalanceBucket(bucket)).toEqual([
      { id: 'b', sort: 1 },
      { id: 'c', sort: 2 },
      { id: 'a', sort: 3 },
    ])
  })

  it('appends after the current max', () => {
    expect(sortAtEnd([item({ sort: 7 }), item({ sort: 2 })])).toBe(8)
  })
})
