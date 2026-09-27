/**
 * Drag-and-drop over grouped item lists — the one dnd surface in the app.
 *
 * Groups are department buckets (or the single root bucket of a flat list).
 * Dragging within a group reorders (fractional `sort`); dropping on another
 * group is ALSO a routing decision — the caller receives the target group key
 * and patches `department_id`/`market_id` along with the rank.
 */
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

import type { ItemRow } from '#/db/collections'
import { rebalanceBucket, sortBetween } from '#/lib/items'
import { cn } from '#/lib/utils'

export interface ItemGroup {
  key: string
  header?: React.ReactNode
  items: ItemRow[]
}

export interface MoveResult {
  itemId: string
  groupKey: string
  /** New rank for the moved item, plus any bucket-wide rebalance. */
  updates: Array<{ id: string; sort: number }>
}

export function GroupedSortable({
  groups,
  onMove,
  renderItem,
}: {
  groups: ItemGroup[]
  onMove: (move: MoveResult) => void
  renderItem: (item: ItemRow) => React.ReactNode
}) {
  const sensors = useSensors(
    // A small activation distance keeps taps (check off, edit) from starting drags.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const itemId = String(active.id)

    // The drop target is either an item (insert at its slot) or a group
    // container (append to that group — how empty groups receive items).
    let targetGroup: ItemGroup | undefined
    let targetIndex: number
    const overId = String(over.id)
    const groupOfOverItem = groups.find((group) => group.items.some((item) => item.id === overId))
    if (groupOfOverItem) {
      targetGroup = groupOfOverItem
      targetIndex = groupOfOverItem.items.findIndex((item) => item.id === overId)
    } else {
      targetGroup = groups.find((group) => group.key === overId)
      targetIndex = targetGroup ? targetGroup.items.length : 0
    }
    if (!targetGroup) return

    const without = targetGroup.items.filter((item) => item.id !== itemId)
    const sourceIndex = targetGroup.items.findIndex((item) => item.id === itemId)
    // Moving down within the same group: the slot AFTER the hovered item.
    const insertAt =
      sourceIndex !== -1 && sourceIndex < targetIndex
        ? Math.min(targetIndex, without.length)
        : Math.min(Math.max(targetIndex, 0), without.length)

    const prev = without[insertAt - 1]?.sort
    const next = without[insertAt]?.sort
    const rank = sortBetween(prev, next)

    if (Number.isNaN(rank)) {
      // Gaps collapsed: renumber the whole bucket in its new order.
      const moved = groups.flatMap((g) => g.items).find((item) => item.id === itemId)
      if (!moved) return
      const reordered = [...without.slice(0, insertAt), moved, ...without.slice(insertAt)]
      onMove({
        itemId,
        groupKey: targetGroup.key,
        updates: rebalanceBucket(reordered).map((entry, index) => ({ ...entry, sort: index + 1 })),
      })
      return
    }

    onMove({ itemId, groupKey: targetGroup.key, updates: [{ id: itemId, sort: rank }] })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <Group key={group.key} group={group} renderItem={renderItem} />
        ))}
      </div>
    </DndContext>
  )
}

function Group({
  group,
  renderItem,
}: {
  group: ItemGroup
  renderItem: (item: ItemRow) => React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: group.key })
  return (
    <section>
      {group.header}
      <SortableContext items={group.items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          className={cn(
            'flex min-h-4 flex-col gap-1.5 rounded-lg transition-colors',
            isOver && 'bg-accent/40',
          )}
        >
          {group.items.map((item) => (
            <SortableRow key={item.id} item={item} renderItem={renderItem} />
          ))}
        </ul>
      </SortableContext>
    </section>
  )
}

function SortableRow({
  item,
  renderItem,
}: {
  item: ItemRow
  renderItem: (item: ItemRow) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-center gap-1', isDragging && 'z-10 opacity-70')}
    >
      <button
        type="button"
        className="grid min-h-11 w-6 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground/60 active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="Reorder"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">{renderItem(item)}</div>
    </li>
  )
}
