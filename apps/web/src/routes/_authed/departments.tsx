/**
 * The departments half of the catalog: every department of every market this
 * user can see, with where it's used, creation, editing and deletion. This is
 * the ONLY place departments are edited — tote list pages link here.
 *
 * Edit rights follow the catalog rules: the department's creator or its
 * market's creator edit in place ("everywhere"); anyone else copy-on-writes
 * into the active tote — possible only when that tote has the market attached.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'

import {
  departmentsCollection,
  marketsCollection,
  toteMarketsCollection,
  type DepartmentRow,
  type MarketRow,
} from '#/db/collections'
import { useAllItems, useHydrated } from '#/db/hooks'
import { copyDepartmentForTote } from '#/lib/catalog'
import { currentUserId, useUser } from '#/lib/auth'
import { newId } from '#/db/ids'
import { useActiveTote } from '#/stores/active-tote'
import { CatalogTabs } from '#/components/catalog-tabs'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Dialog } from '#/components/ui/dialog'
import { Input, Select, Textarea } from '#/components/ui/input'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/departments')({ component: DepartmentsPage })

function DepartmentsPage() {
  const hydrated = useHydrated()
  const user = useUser()
  const items = useAllItems()
  const { activeToteId } = useActiveTote()
  const { data: markets } = useLiveQuery({ query: (q) => q.from({ markets: marketsCollection }) })
  const { data: departments } = useLiveQuery({
    query: (q) => q.from({ departments: departmentsCollection }),
  })
  const { data: attachments } = useLiveQuery({
    query: (q) => q.from({ attachments: toteMarketsCollection }),
  })
  const [editingId, setEditingId] = useState<string | null>(null)

  if (!hydrated) return null

  const sortedMarkets = [...markets].sort((a, b) => a.name.localeCompare(b.name))
  const departmentsOf = (marketId: string) =>
    departments
      .filter((dept) => dept.market_id === marketId)
      .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))

  const usage = (deptId: string) => {
    const referencing = items.filter((item) => item.department_id === deptId)
    return { items: referencing.length, totes: new Set(referencing.map((item) => item.tote_id)).size }
  }

  const canEditInPlace = (dept: DepartmentRow, market: MarketRow | undefined) =>
    dept.created_by === user?.id || market?.created_by === user?.id

  const activeToteHasMarket = (marketId: string) =>
    attachments.some((row) => row.tote_id === activeToteId && row.market_id === marketId)

  const editing = departments.find((dept) => dept.id === editingId)
  const editingMarket = editing ? markets.find((market) => market.id === editing.market_id) : undefined

  return (
    <div className="flex flex-col gap-4">
      <CatalogTabs />

      {sortedMarkets.map((market) => (
        <section key={market.id} className="rounded-xl border bg-card p-3">
          <h2 className="mb-2 font-semibold">{market.name}</h2>
          <ul className="flex flex-col gap-1.5">
            {departmentsOf(market.id).map((dept) => {
              const use = usage(dept.id)
              const editable = canEditInPlace(dept, market) || activeToteHasMarket(market.id)
              return (
                <li key={dept.id} className="flex min-h-11 items-center gap-2 rounded-lg border px-3">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-medium">{dept.name}</span>
                    {dept.classification_hint && (
                      <small className="ml-1.5 text-xs text-muted-foreground/80">
                        {dept.classification_hint}
                      </small>
                    )}
                  </span>
                  {dept.auto_created === 1 && <Badge variant="outline">{m.auto_created_badge()}</Badge>}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {use.items > 0 ? m.dept_usage({ items: use.items, totes: use.totes }) : m.dept_unused()}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!editable}
                    title={editable ? undefined : m.creator_only_edit()}
                    onClick={() => setEditingId(dept.id)}
                  >
                    {m.edit()}
                  </Button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <NewDepartmentForm markets={sortedMarkets} counts={(id) => departmentsOf(id).length} />

      {editing && (
        <EditDepartmentDialog
          dept={editing}
          inPlace={canEditInPlace(editing, editingMarket)}
          activeToteId={activeToteId}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  )
}

function NewDepartmentForm({
  markets,
  counts,
}: {
  markets: MarketRow[]
  counts: (marketId: string) => number
}) {
  return (
    <form
      className="flex flex-col gap-2 rounded-xl border border-dashed p-3"
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const marketId = String(form.get('market') ?? '')
        const name = String(form.get('name') ?? '').trim()
        if (!marketId || !name) return
        departmentsCollection.insert({
          id: newId(),
          market_id: marketId,
          created_by: currentUserId(),
          name,
          classification_hint: String(form.get('hint') ?? '').trim(),
          sort: counts(marketId) + 1,
          auto_created: 0,
        })
        event.currentTarget.reset()
      }}
    >
      <h2 className="text-sm font-medium text-muted-foreground">{m.new_department()}</h2>
      <Select name="market" defaultValue="" required aria-label={m.market_label()}>
        <option value="" disabled>
          {m.market_label()}
        </option>
        {markets.map((market) => (
          <option key={market.id} value={market.id}>
            {market.name}
          </option>
        ))}
      </Select>
      <Input name="name" placeholder={m.market_name_label()} required />
      <Textarea name="hint" placeholder={m.dept_hint_placeholder()} />
      <Button type="submit" variant="secondary" className="self-end">
        {m.create()}
      </Button>
    </form>
  )
}

function EditDepartmentDialog({
  dept,
  inPlace,
  activeToteId,
  onClose,
}: {
  dept: DepartmentRow
  inPlace: boolean
  activeToteId: string | null
  onClose: () => void
}) {
  const items = useAllItems()

  return (
    <Dialog open onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          const name = String(form.get('name') ?? '').trim()
          const hint = String(form.get('hint') ?? '').trim()
          if (!name) return
          if (inPlace) {
            departmentsCollection.update(dept.id, (draft) => {
              draft.name = name
              draft.classification_hint = hint
            })
          } else if (activeToteId) {
            copyDepartmentForTote(activeToteId, dept, items, { name, classification_hint: hint })
          }
          onClose()
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium">
          {m.market_name_label()}
          <Input name="name" defaultValue={dept.name} required />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {m.hint_label()}
          <Textarea name="hint" defaultValue={dept.classification_hint} placeholder={m.dept_hint_placeholder()} />
        </label>
        {!inPlace && <p className="text-xs text-muted-foreground">{m.copy_for_tote()}</p>}
        <div className="flex justify-between gap-2">
          <Button
            variant="destructive"
            disabled={!inPlace}
            onClick={() => {
              // items.department_id is ON DELETE SET NULL — every tote's
              // references fall back to the "Other" bucket, nothing dangles.
              departmentsCollection.delete(dept.id)
              onClose()
            }}
          >
            {m.delete()}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              {m.cancel()}
            </Button>
            <Button type="submit">{m.save()}</Button>
          </div>
        </div>
      </form>
    </Dialog>
  )
}
