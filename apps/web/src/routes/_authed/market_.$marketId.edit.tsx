/**
 * A market's configuration: its name and hint, and the departments it has —
 * the aisle order you walk.
 *
 * Two kinds of department land in the same list. A PRESET is shared with every
 * other market that attached it, so it is deliberately read-only here: editing
 * it from one store would silently change the others, and the link out to
 * /department/{id}/edit makes that consequence explicit. A CUSTOM department
 * belongs to this market alone and is edited in place.
 */
import { Link, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Copy, Pencil, Trash2 } from 'lucide-react'

import {
  departmentsCollection,
  marketDepartmentsCollection,
  marketsCollection,
} from '#/db/collections'
import {
  useCatalogMarkets,
  useDepartmentPresets,
  useHydrated,
  useMarketDepartmentRowsFor,
  useMarketDepartments,
  useToteItems,
} from '#/db/hooks'
import { attachDepartment, copyDepartmentForMarket, detachDepartment } from '#/lib/catalog'
import { useActiveTote } from '#/stores/active-tote'
import { currentUserId } from '#/lib/auth'
import { newId } from '#/db/ids'
import { fromUrlId, toUrlId } from '#/lib/url-id'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Select } from '#/components/ui/input'
import { SortableList } from '#/components/sortable-list'
import { MarketForm } from '#/components/market-form'
import { DepartmentForm } from '#/components/department-form'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/market_/$marketId/edit')({
  component: EditMarketPage,
  // The URL carries the id without its `==` padding; see lib/url-id.
  params: {
    parse: ({ marketId }) => ({ marketId: fromUrlId(marketId) }),
    stringify: ({ marketId }) => ({ marketId: toUrlId(marketId) }),
  },
})

function EditMarketPage() {
  const { marketId } = Route.useParams()
  const hydrated = useHydrated()
  const markets = useCatalogMarkets()
  const departments = useMarketDepartments(marketId)
  const attachments = useMarketDepartmentRowsFor(marketId)
  const presets = useDepartmentPresets()
  const { activeToteId } = useActiveTote()
  const items = useToteItems(activeToteId)
  const [adding, setAdding] = useState(false)

  if (!hydrated) return null

  const market = markets.find((entry) => entry.id === marketId)
  if (!market) {
    return <p className="pt-8 text-center text-sm text-muted-foreground">{m.not_found()}</p>
  }

  const canEditMarket = !market.created_by || market.created_by === currentUserId()
  const attachedIds = new Set(attachments.map((row) => row.department_id))
  const attachable = presets.filter((preset) => !attachedIds.has(preset.id))

  const reorder = (ordered: typeof attachments) => {
    ordered.forEach((row, index) => {
      if (row.sort === index + 1) return
      marketDepartmentsCollection.update(row.id, (draft) => {
        draft.sort = index + 1
      })
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-xl font-semibold">{m.edit_market_title()}</h1>

      {!canEditMarket && <p className="text-sm text-muted-foreground">{m.creator_only_edit()}</p>}

      <MarketForm
        market={market}
        submitLabel={m.save()}
        disabled={!canEditMarket}
        onSubmit={(fields) => {
          marketsCollection.update(market.id, (draft) => {
            draft.name = fields.name
            draft.classification_hint = fields.classification_hint
            draft.updated_at = Math.floor(Date.now() / 1000)
          })
        }}
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{m.departments_title()}</h2>

        {departments.length === 0 && (
          <p className="text-sm text-muted-foreground">{m.no_department()}</p>
        )}

        <SortableList
          items={attachments}
          onReorder={reorder}
          renderItem={(attachment) => {
            const department = departments.find((dept) => dept.id === attachment.department_id)
            if (!department) return null
            const isPreset = !department.owner_market_id
            return (
              <div className="flex items-center gap-1 rounded-xl border bg-card p-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{department.name}</span>
                    {isPreset && <Badge variant="outline">{m.preset_label()}</Badge>}
                    {department.auto_created === 1 && (
                      <Badge variant="outline">{m.auto_created_badge()}</Badge>
                    )}
                  </div>
                  {department.classification_hint && (
                    <p className="truncate text-xs text-muted-foreground">
                      {department.classification_hint}
                    </p>
                  )}
                </div>

                {/*
                  A preset is shared, so it is never edited from here — the
                  link goes where the blast radius is visible. "Customise"
                  swaps in a market-local copy for anyone who wants this store
                  to differ without touching the preset.
                */}
                {isPreset && activeToteId && (
                  <button
                    type="button"
                    onClick={() =>
                      copyDepartmentForMarket(activeToteId, department, attachment, items)
                    }
                    aria-label={m.customise_here()}
                    title={m.customise_here()}
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
                  >
                    <Copy className="size-4" />
                  </button>
                )}
                <Link
                  to="/department/$departmentId/edit"
                  params={{ departmentId: department.id }}
                  aria-label={isPreset ? m.edit_preset() : m.edit()}
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
                >
                  <Pencil className="size-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => detachDepartment(attachment, department)}
                  aria-label={m.detach()}
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            )
          }}
        />

        {attachable.length > 0 && (
          <Select
            value=""
            aria-label={m.add_department()}
            onChange={(event) => {
              if (!event.target.value) return
              attachDepartment(market.id, event.target.value, attachments.length + 1)
            }}
          >
            <option value="">{m.add_department()}</option>
            {attachable.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </Select>
        )}

        {adding ? (
          <div className="rounded-xl border border-dashed p-3">
            <DepartmentForm
              submitLabel={m.create()}
              resetOnSubmit
              onSubmit={(fields) => {
                const id = newId()
                departmentsCollection.insert({
                  id,
                  created_by: currentUserId(),
                  name: fields.name,
                  classification_hint: fields.classification_hint,
                  owner_market_id: market.id, // Custom: this market only.
                  auto_created: 0,
                })
                attachDepartment(market.id, id, attachments.length + 1)
                setAdding(false)
              }}
            />
          </div>
        ) : (
          <Button variant="outline" className="self-start" onClick={() => setAdding(true)}>
            {m.custom_department()}
          </Button>
        )}

        <Link
          to="/departments"
          className="self-start text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          {m.manage_departments()} →
        </Link>
      </section>
    </div>
  )
}
