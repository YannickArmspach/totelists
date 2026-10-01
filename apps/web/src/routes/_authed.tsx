/**
 * Everything behind sign-in lives under this pathless layout: the toolbar,
 * the navigation — a bottom bar under the thumb on a phone, a row in the
 * toolbar on a desktop — and the redirect that makes Tote account-only.
 *
 * The session lives in localStorage, so the check can only run in the browser;
 * the server renders the shell blind and the first client render redirects.
 */
import { Link, Outlet, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { History, Home, LogOut, ShoppingBag, Store } from 'lucide-react'

import { hasStoredSession, logout } from '#/lib/auth'
import { useHydrated, useMyTotes } from '#/db/hooks'
import { installResyncOnResume } from '#/db/resync'
import { Breadcrumb } from '#/components/breadcrumb'
import { EditAction } from '#/components/edit-action'
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
    <div className="flex min-h-dvh w-full flex-col">
      <Header />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        <InviteBanner />
        <main className="flex-1 px-4 pb-28 pt-4 md:pb-8">
          <Outlet />
        </main>
      </div>
      {/*
        Outside the header on purpose: the header carries backdrop-blur, which
        makes it a containing block, and a `fixed` child would then anchor to
        the bar instead of the viewport.
      */}
      <BottomBar />
      <ConnectionLostModal />
    </div>
  )
}

function Header() {
  const totes = useMyTotes()
  const { activeToteId, setActiveTote } = useActiveTote()

  /*
    The header no longer renders the totes — the card strip on home does — but
    this repair must live somewhere always-mounted: the stored id may point at
    a tote we've since left, and every per-tote page reads it.
  */
  const active = totes.find((tote) => tote.id === activeToteId) ?? totes[0]
  useEffect(() => {
    if (active && active.id !== activeToteId) setActiveTote(active.id)
  }, [active, activeToteId, setActiveTote])

  return (
    /*
      Three columns rather than a flex row with a spacer: the middle is then
      centred on the BAR, not on whatever is left over after the actions, so
      the logo does not drift as the breadcrumb or the edit button change width.
    */
    <header
      className="sticky top-0 z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b bg-background/90 px-4 py-2 backdrop-blur"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
    >
      <ToolbarNav />

      <div className="flex min-w-0 items-center gap-2 justify-self-center">
        <Link to="/" className="flex shrink-0 items-center gap-1.5 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <ShoppingBag className="size-4" />
          </span>
        </Link>
        <Breadcrumb />
      </div>

      <div className="flex items-center gap-1 justify-self-end">
        <EditAction />
        <SyncIndicator />
        <LocaleToggle />
        <button
          type="button"
          onClick={() => void logout()}
          aria-label={m.logout()}
          className="grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
        >
          <LogOut className="size-4" />
        </button>
      </div>
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

/**
 * One set of destinations, two presentations.
 *
 * Phone: a bar fixed under the thumb, icons over labels, tabs sharing the
 * width. Desktop: a horizontal row at the left of the toolbar, where the
 * pointer already is and where there is room to spare.
 *
 * They cannot be one element — the header's backdrop-blur is a containing
 * block, so a `fixed` bottom bar nested inside it would anchor to the bar
 * rather than the viewport — so the destinations live here once and each
 * presentation renders them.
 */
function navLinks(className: string) {
  return (
    <>
      <Link to="/" className={className} activeOptions={{ exact: true }}>
        <Home className="size-5 shrink-0 md:size-4" />
        {m.home_title()}
      </Link>
      <Link to="/totes" className={className}>
        <ShoppingBag className="size-5 shrink-0 md:size-4" />
        {m.totes_title()}
      </Link>
      <Link to="/markets" className={className}>
        <Store className="size-5 shrink-0 md:size-4" />
        {m.markets_title()}
      </Link>
      <Link to="/history" className={className}>
        <History className="size-5 shrink-0 md:size-4" />
        {m.history_title()}
      </Link>
    </>
  )
}

/** The toolbar's left column, from md up. */
function ToolbarNav() {
  return (
    <nav className="hidden items-center gap-0.5 justify-self-start md:flex">
      {navLinks(
        'inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary [&.active]:bg-secondary [&.active]:text-primary',
      )}
    </nav>
  )
}

/** The phone's bottom bar. */
function BottomBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex w-full max-w-2xl">
        {navLinks(
          'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground [&.active]:text-primary',
        )}
      </div>
    </nav>
  )
}
