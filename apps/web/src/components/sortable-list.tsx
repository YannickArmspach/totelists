/**
 * Drag-to-reorder for the catalog lists — markets, a market's departments.
 *
 * Items carry an integer `sort`; a drop renumbers the whole list 1..n, which
 * is the simple, always-correct option at catalog scale (a handful of rows).
 * The fractional-rank scheme in GroupedSortable exists because shopping lists
 * get long and are reordered constantly; a market list is neither.
 *
 * The same activation constraints as GroupedSortable, so a tap on a row still
 * opens it instead of starting a drag.
 */
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

import { cn } from '#/lib/utils'
import { m } from '#/paraglide/messages'

export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
}: {
  items: T[]
  /** The full list in its new order; persist each row's index as `sort`. */
  onReorder: (ordered: T[]) => void
  renderItem: (item: T) => React.ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = items.findIndex((item) => item.id === active.id)
    const to = items.findIndex((item) => item.id === over.id)
    if (from === -1 || to === -1) return
    onReorder(arrayMove(items, from, to))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <SortableRow key={item.id} id={item.id}>
              {renderItem(item)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
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
        aria-label={m.reorder()}
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  )
}
