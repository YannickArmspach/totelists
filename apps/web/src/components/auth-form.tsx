import { useState } from 'react'
import { ShoppingBag } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { AuthError } from '#/lib/auth'
import { m } from '#/paraglide/messages'

export function AuthForm({
  title,
  submitLabel,
  onSubmit,
  footer,
}: {
  title: string
  submitLabel: string
  onSubmit: (email: string, password: string) => Promise<void>
  footer: React.ReactNode
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <ShoppingBag className="size-7" />
          </span>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{m.baseline()}</p>
        </div>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            setPending(true)
            setError(null)
            setNotice(null)
            try {
              await onSubmit(String(form.get('email') ?? ''), String(form.get('password') ?? ''))
            } catch (err) {
              if (err instanceof AuthError) setError(err.message)
              else setNotice((err as Error).message)
            } finally {
              setPending(false)
            }
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-medium">
            {m.email_label()}
            <Input name="email" type="email" autoComplete="email" required />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {m.password_label()}
            <Input name="password" type="password" autoComplete="current-password" required minLength={8} />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
          <Button type="submit" size="lg" disabled={pending}>
            {submitLabel}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">{footer}</p>
      </div>
    </main>
  )
}
