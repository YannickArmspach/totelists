/**
 * Create a department preset: a name and a hint, reusable by every market.
 * Market-local custom departments are created on a market's edit page instead.
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { departmentsCollection } from '#/db/collections'
import { currentUserId } from '#/lib/auth'
import { newId } from '#/db/ids'
import { DepartmentForm } from '#/components/department-form'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/department/new')({ component: NewDepartmentPage })

function NewDepartmentPage() {
  const navigate = useNavigate()

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="text-xl font-semibold">{m.new_department_title()}</h1>
      <DepartmentForm
        submitLabel={m.create()}
        onSubmit={async (fields) => {
          departmentsCollection.insert({
            id: newId(),
            created_by: currentUserId(),
            name: fields.name,
            classification_hint: fields.classification_hint,
            owner_market_id: null, // A preset belongs to no single market.
            auto_created: 0,
          })
          await navigate({ to: '/departments' })
        }}
      />
    </div>
  )
}
