/**
 * Edit one department preset. Because a preset is shared, a change here lands
 * in every market that attached it — which is the whole point, and why a
 * market's edit page links out to this instead of editing inline.
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { departmentsCollection } from '#/db/collections'
import { useDepartment, useDepartmentUsage, useHydrated } from '#/db/hooks'
import { fromUrlId, toUrlId } from '#/lib/url-id'
import { currentUserId } from '#/lib/auth'
import { Button } from '#/components/ui/button'
import { DepartmentForm } from '#/components/department-form'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/department_/$departmentId/edit')({
  component: EditDepartmentPage,
  // The URL carries the id without its `==` padding; see lib/url-id.
  params: {
    parse: ({ departmentId }) => ({ departmentId: fromUrlId(departmentId) }),
    stringify: ({ departmentId }) => ({ departmentId: toUrlId(departmentId) }),
  },
})

function EditDepartmentPage() {
  const { departmentId } = Route.useParams()
  const hydrated = useHydrated()
  const department = useDepartment(departmentId)
  const usage = useDepartmentUsage(departmentId)
  const navigate = useNavigate()

  if (!hydrated) return null
  if (!department) {
    return <p className="pt-8 text-center text-sm text-muted-foreground">{m.not_found()}</p>
  }

  const canEdit = !department.created_by || department.created_by === currentUserId()

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="text-xl font-semibold">{m.edit_department_title()}</h1>

      <p className="text-sm text-muted-foreground">
        {usage.length > 0 ? m.used_by_markets({ count: usage.length }) : m.dept_unused()}
      </p>

      {!canEdit && <p className="text-sm text-muted-foreground">{m.creator_only_edit()}</p>}

      <DepartmentForm
        department={department}
        submitLabel={m.save()}
        disabled={!canEdit}
        onSubmit={(fields) => {
          departmentsCollection.update(department.id, (draft) => {
            draft.name = fields.name
            draft.classification_hint = fields.classification_hint
          })
        }}
      />

      {canEdit && (
        <Button
          variant="ghost"
          className="self-start text-destructive"
          onClick={() => {
            departmentsCollection.delete(department.id)
            void navigate({ to: '/departments' })
          }}
        >
          {m.delete()}
        </Button>
      )}
    </div>
  )
}
