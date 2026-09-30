/**
 * The department preset catalog: reusable shelf categories, defined once and
 * attached to as many markets as you like.
 *
 * Only presets live here. A department custom to one market is created and
 * edited on that market's own page, and never shows up in this list.
 */
import { Link, createFileRoute } from '@tanstack/react-router'
import { Pencil, Plus } from 'lucide-react'

import {
  useAllItems,
  useAllMarketDepartments,
  useDepartmentPresets,
  useHydrated,
} from '#/db/hooks'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/departments')({ component: DepartmentsPage })

function DepartmentsPage() {
  const hydrated = useHydrated()
  const presets = useDepartmentPresets()
  const attachments = useAllMarketDepartments()
  const items = useAllItems()

  if (!hydrated) return null

  const marketCount = (departmentId: string) =>
    attachments.filter((row) => row.department_id === departmentId).length
  const itemCount = (departmentId: string) =>
    items.filter((item) => item.department_id === departmentId).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{m.departments_title()}</h1>
        <Link
          to="/department/new"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-secondary"
        >
          <Plus className="size-4" />
          {m.new_department()}
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">{m.departments_presets_hint()}</p>

      {presets.length === 0 ? (
        <p className="pt-8 text-center text-sm text-muted-foreground">{m.dept_unused()}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {presets.map((preset) => {
            const markets = marketCount(preset.id)
            return (
              <li
                key={preset.id}
                className="flex items-center gap-2 rounded-xl border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{preset.name}</span>
                  {preset.classification_hint && (
                    <p className="truncate text-xs text-muted-foreground">
                      {preset.classification_hint}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {markets > 0
                      ? m.dept_usage_markets({ items: itemCount(preset.id), markets })
                      : m.dept_unused()}
                  </p>
                </div>
                <Link
                  to="/department/$departmentId/edit"
                  params={{ departmentId: preset.id }}
                  aria-label={m.edit()}
                  className="grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
                >
                  <Pencil className="size-4" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
