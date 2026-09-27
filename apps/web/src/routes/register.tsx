import { Link, createFileRoute } from '@tanstack/react-router'

import { AuthForm } from '#/components/auth-form'
import { signUp } from '#/lib/auth'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/register')({ component: RegisterPage })

function RegisterPage() {
  return (
    <AuthForm
      title={m.register_title()}
      submitLabel={m.register_cta()}
      onSubmit={async (email, password) => {
        await signUp(email, password)
        // Registration cannot hand back a session: the backend wants the email
        // confirmed first. Say so instead of appearing to hang.
        throw new Error(m.register_done())
      }}
      footer={
        <Link to="/login" className="underline underline-offset-2">
          {m.have_account()}
        </Link>
      }
    />
  )
}
