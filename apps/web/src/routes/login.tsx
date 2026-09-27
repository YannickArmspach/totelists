import { Link, createFileRoute } from '@tanstack/react-router'

import { AuthForm } from '#/components/auth-form'
import { signInWithPassword } from '#/lib/auth'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/login')({ component: LoginPage })

function LoginPage() {
  return (
    <AuthForm
      title={m.login_title()}
      submitLabel={m.login_cta()}
      onSubmit={async (email, password) => {
        await signInWithPassword(email, password)
        // A full navigation: the collections open against the account once,
        // at startup, so reaching its data means loading the app again.
        window.location.replace('/')
      }}
      footer={
        <Link to="/register" className="underline underline-offset-2">
          {m.need_account()}
        </Link>
      }
    />
  )
}
