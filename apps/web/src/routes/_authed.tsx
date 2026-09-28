/**
 * Everything behind sign-in lives under this pathless layout: a header with
 * the tote switcher, a bottom tab bar sized for thumbs, and the redirect that
 * makes Tote account-only.
 *
 * The session lives in localStorage, so the check can only run in the browser;
 * the server renders the shell blind and the first client render redirects.
 */
import { Link, Outlet, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { History, LayoutGrid, LogOut, ShoppingBag, Store } from 'lucide-react'

import { hasStoredSession, logout } from '#/lib/auth'
import { useHydrated, useMyTotes } from '#/db/hooks'
import { installResyncOnResume } from '#/db/resync'
import { InviteBanner } from '#/components/invite-banner'
import { SyncIndicator } from '#/components/sync-indicator'
import { ConnectionLostModal } from '#/components/connection-lost'
import { useActiveTote } from '#/stores/active-tote'
import { getLocale, locales, setLocale } from '#/paraglide/runtime'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed')({ component: AuthedLayout })

function AuthedLayout() {
  const hydrated = useHydrated()
  const navigate = useNavigate()

  useEffect(() => {
    if (hydrated && !hasStoredSession()) {
      void navigate({ to: '/login', replace: true })
    }
  }, [hydrated, navigate])

  // Realtime streams don't survive Safari backgrounding or network changes,
  // and the adapter never reconnects on its own — resync when we come back.
  useEffect(() => {
    if (hydrated && hasStoredSession()) installResyncOnResume()
  }, [hydrated])

  if (hydrated && !hasStoredSession()) return null

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <Header />
      <InviteBanner />
      <main className="flex-1 px-4 pb-28 pt-4">
        <Outlet />
      </main>
      <TabBar />
      <ConnectionLostModal />
    </div>
  )
}

function Header() {
  const totes = useMyTotes()
  const { activeToteId, setActiveTote } = useActiveTote()

  // The stored id may point at a tote we've since left; fall back to the first.
  const active = totes.find((tote) => tote.id === activeToteId) ?? totes[0]
  useEffect(() => {
    if (active && active.id !== activeToteId) setActiveTote(active.id)
  }, [active, activeToteId, setActiveTote])

  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/90 px-4 py-2 backdrop-blur"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
    >
      <Link to="/" className="flex items-center gap-1.5 font-semibold">
        <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <ShoppingBag className="size-4" />
        </span>
      </Link>
      {totes.length > 0 && (
        <select
          value={active?.id ?? ''}
          onChange={(event) => setActiveTote(event.target.value)}
          className="min-h-10 max-w-44 flex-1 truncate rounded-lg border bg-card px-2 text-sm font-medium"
          aria-label={m.my_totes()}
        >
          {totes.map((tote) => (
            <option key={tote.id} value={tote.id}>
              {tote.name}
            </option>
          ))}
        </select>
      )}
      <Link to="/totes" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
        {m.my_totes()}
      </Link>
      <span className="flex-1" />
      <SyncIndicator />
      <LocaleToggle />
      <button
        type="button"
        onClick={() => void logout()}
        aria-label={m.logout()}
        className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
      >
        <LogOut className="size-4" />
      </button>
    </header>
  )
}

function LocaleToggle() {
  const current = getLocale()
  const next = locales.find((locale) => locale !== current) ?? current
  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      aria-label={m.language()}
      className="grid size-10 place-items-center rounded-lg text-sm font-medium text-muted-foreground uppercase hover:bg-secondary"
    >
      {next}
    </button>
  )
}

function TabBar() {
  const tab =
    'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground [&.active]:text-primary'

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex w-full max-w-2xl">
        <Link to="/" className={tab} activeOptions={{ exact: true }}>
          <ShoppingBag className="size-5" />
          {m.app_name()}
        </Link>
        <Link to="/markets" className={tab}>
          <Store className="size-5" />
          {m.markets_title()}
        </Link>
        <Link to="/overview" className={tab}>
          <LayoutGrid className="size-5" />
          {m.overview_title()}
        </Link>
        <Link to="/history" className={tab}>
          <History className="size-5" />
          {m.history_title()}
        </Link>
      </div>
    </nav>
  )
}
