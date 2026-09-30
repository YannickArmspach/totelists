/**
 * Where you are, next to the logo — and a way sideways from each step.
 *
 * The logo IS the home crumb, so home renders nothing and every other route
 * starts at its section. Entity crumbs show the real name — "Courses", not an
 * id — and each crumb carries a caret opening the whole level: the other totes
 * from a tote, the other sections from a section, with the one you are on
 * greyed in place. Switching store while standing in one is the move this is
 * for.
 *
 * Built from the matched route id rather than by splitting the pathname: the
 * ids are exhaustive and typo-proof, and the params come already parsed (so
 * the padded record id is what reaches the hooks, not the short URL form).
 */
import { Link, useMatches } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, ShoppingBag, Store, Tag } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useCatalogMarkets, useDepartmentPresets, useDepartment, useMyTotes, useTote } from '#/db/hooks'
import { cn } from '#/lib/utils'
import { m } from '#/paraglide/messages'

type SectionPath = '/totes' | '/markets' | '/departments' | '/history'

/**
 * One entry of a crumb's dropdown; the kind picks the Link shape. `current`
 * marks the one you are already on — it stays in the list, greyed, so the
 * dropdown reads as the full set rather than a mystery subset.
 */
type Sibling = { current?: boolean } & (
  | { kind: 'tote'; id: string; label: string }
  | { kind: 'market'; id: string; label: string }
  | { kind: 'tote-edit'; id: string; label: string }
  | { kind: 'market-edit'; id: string; label: string }
  | { kind: 'tote-market'; id: string; toteId: string; marketId: string; label: string }
  | { kind: 'department'; id: string; label: string }
  | { kind: 'section'; to: SectionPath; label: string }
)

/** Where a crumb's text goes. Entity crumbs point at their own page. */
type CrumbLink =
  | { kind: 'section'; to: SectionPath }
  | { kind: 'tote'; id: string }
  | { kind: 'market'; id: string }

interface Crumb {
  label: string
  /** The kind, as a glyph: which sort of thing this name is. */
  Icon?: LucideIcon
  /** Omitted when there is nowhere above to go — or you are already there. */
  href?: CrumbLink
  siblings?: Sibling[]
}

/** A small kind glyph, then the name carrying the weight. */
function CrumbLabel({
  Icon,
  label,
  emphasis,
}: {
  Icon?: LucideIcon
  label: string
  emphasis?: boolean
}) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground/70" />}
      <span className={cn('truncate', emphasis && 'font-medium text-foreground')}>{label}</span>
    </span>
  )
}

function CrumbLinkText({
  href,
  label,
  Icon,
}: {
  href: CrumbLink
  label: string
  Icon?: LucideIcon
}) {
  const className = 'flex min-w-0 hover:underline'
  const content = <CrumbLabel Icon={Icon} label={label} />
  if (href.kind === 'tote') {
    return (
      <Link to="/tote/$toteId" params={{ toteId: href.id }} className={className}>
        {content}
      </Link>
    )
  }
  if (href.kind === 'market') {
    return (
      <Link to="/market/$marketId" params={{ marketId: href.id }} className={className}>
        {content}
      </Link>
    )
  }
  return (
    <Link to={href.to} className={className}>
      {content}
    </Link>
  )
}

export function Breadcrumb() {
  const matches = useMatches()
  const leaf = matches.at(-1)
  const params = (leaf?.params ?? {}) as Record<string, string | undefined>

  // Unconditional so the hook order never changes; each no-ops on undefined.
  const tote = useTote(params.toteId)
  const department = useDepartment(params.departmentId)
  const totes = useMyTotes()
  const markets = useCatalogMarkets()
  const presets = useDepartmentPresets()
  const market = markets.find((entry) => entry.id === params.marketId)

  const sections: Sibling[] = [
    { kind: 'section', to: '/totes', label: m.totes_title() },
    { kind: 'section', to: '/markets', label: m.markets_title() },
    { kind: 'section', to: '/departments', label: m.departments_title() },
    { kind: 'section', to: '/history', label: m.history_title() },
  ]

  const crumbs = trail(leaf?.routeId, {
    sections,
    toteId: params.toteId,
    tote,
    market,
    department,
    toteSiblings: totes.map((row) => ({ kind: 'tote' as const, id: row.id, label: row.name })),
    marketSiblings: markets.map((row) => ({ kind: 'market' as const, id: row.id, label: row.name })),
    departmentSiblings: presets.map((row) => ({
      kind: 'department' as const,
      id: row.id,
      label: row.name,
    })),
  })
  if (crumbs.length === 0) return null

  return (
    <nav
      aria-label={m.breadcrumb()}
      /* No flex-1: the header's spacer owns the slack, so this shrinks and
         truncates instead of claiming half the bar. */
      className="flex min-w-0 items-center gap-0.5 text-sm text-muted-foreground"
    >
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1
        // A menu holding only the current entry offers nowhere to go.
        const hasOthers = crumb.siblings?.some((sibling) => !sibling.current) ?? false
        const linked = Boolean(crumb.href) && !last
        return (
          <span key={index} className="flex min-w-0 items-center gap-0.5">
            {index > 0 && <ChevronRight className="size-3.5 shrink-0 opacity-60" />}
            {linked && (
              <CrumbLinkText href={crumb.href!} label={crumb.label} Icon={crumb.Icon} />
            )}
            {/*
              With no link of its own, the crumb has nothing to do on click —
              so the label joins the caret as one trigger and the whole thing
              opens the menu. A linked crumb keeps them apart: the text
              navigates up, the caret goes sideways.
            */}
            {hasOthers ? (
              <SiblingMenu
                label={crumb.label}
                Icon={linked ? undefined : crumb.Icon}
                siblings={crumb.siblings!}
                inline={!linked}
                emphasis={last}
              />
            ) : (
              !linked && <CrumbLabel Icon={crumb.Icon} label={crumb.label} emphasis={last} />
            )}
          </span>
        )
      })}
    </nav>
  )
}

function SiblingMenu({
  label,
  Icon,
  siblings,
  /** Put the crumb's own label inside the trigger, for a crumb with no link. */
  inline = false,
  /** The last crumb is the page you are on, and reads as such. */
  emphasis = false,
}: {
  label: string
  Icon?: LucideIcon
  siblings: Sibling[]
  inline?: boolean
  emphasis?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const itemClass = 'block truncate rounded px-2 py-1.5 text-sm hover:bg-secondary'

  return (
    <span ref={ref} className={cn('relative', inline ? 'min-w-0' : 'shrink-0')}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={m.switch_from({ name: label })}
        /* The label stays plain breadcrumb text — the arrow is the only part
           that looks like a control, and only under the pointer. */
        className={cn('flex items-center', inline && 'min-w-0 max-w-full gap-0.5')}
      >
        {inline && <CrumbLabel Icon={Icon} label={label} emphasis={emphasis} />}
        <span className="grid size-5 shrink-0 place-items-center rounded hover:bg-secondary">
          <ChevronDown
            className={cn(
              'size-3.5 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </span>
      </button>
      {open && (
        // z-20 clears the sticky header's own z-10 stacking.
        <span
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 flex max-h-72 min-w-40 max-w-64 flex-col overflow-y-auto rounded-lg border bg-card p-1 shadow-lg"
        >
          {siblings.map((sibling) => {
            const close = () => setOpen(false)
            // Where you already are: shown for context, greyed, not a target.
            if (sibling.current) {
              return (
                <span
                  key={sibling.kind === 'section' ? sibling.to : sibling.id}
                  role="menuitem"
                  aria-current="true"
                  aria-disabled="true"
                  className="block cursor-default truncate rounded px-2 py-1.5 text-sm text-muted-foreground/60"
                >
                  {sibling.label}
                </span>
              )
            }
            if (sibling.kind === 'section') {
              return (
                <Link key={sibling.to} to={sibling.to} role="menuitem" className={itemClass} onClick={close}>
                  {sibling.label}
                </Link>
              )
            }
            if (sibling.kind === 'tote') {
              return (
                <Link
                  key={sibling.id}
                  to="/tote/$toteId"
                  params={{ toteId: sibling.id }}
                  role="menuitem"
                  className={itemClass}
                  onClick={close}
                >
                  {sibling.label}
                </Link>
              )
            }
            if (sibling.kind === 'tote-market') {
              return (
                <Link
                  key={sibling.id}
                  to="/tote/$toteId/market/$marketId"
                  params={{ toteId: sibling.toteId, marketId: sibling.marketId }}
                  role="menuitem"
                  className={itemClass}
                  onClick={close}
                >
                  {sibling.label}
                </Link>
              )
            }
            if (sibling.kind === 'tote-edit') {
              return (
                <Link
                  key={sibling.id}
                  to="/tote/$toteId/edit"
                  params={{ toteId: sibling.id }}
                  role="menuitem"
                  className={itemClass}
                  onClick={close}
                >
                  {sibling.label}
                </Link>
              )
            }
            if (sibling.kind === 'market-edit') {
              return (
                <Link
                  key={sibling.id}
                  to="/market/$marketId/edit"
                  params={{ marketId: sibling.id }}
                  role="menuitem"
                  className={itemClass}
                  onClick={close}
                >
                  {sibling.label}
                </Link>
              )
            }
            if (sibling.kind === 'market') {
              return (
                <Link
                  key={sibling.id}
                  to="/market/$marketId"
                  params={{ marketId: sibling.id }}
                  role="menuitem"
                  className={itemClass}
                  onClick={close}
                >
                  {sibling.label}
                </Link>
              )
            }
            return (
              <Link
                key={sibling.id}
                to="/department/$departmentId/edit"
                params={{ departmentId: sibling.id }}
                role="menuitem"
                className={itemClass}
                onClick={close}
              >
                {sibling.label}
              </Link>
            )
          })}
        </span>
      )}
    </span>
  )
}

function trail(
  routeId: string | undefined,
  data: {
    sections: Sibling[]
    toteId?: string
    tote?: { id: string; name: string }
    market?: { id: string; name: string }
    department?: { id: string; name: string }
    toteSiblings: Sibling[]
    marketSiblings: Sibling[]
    departmentSiblings: Sibling[]
  },
): Crumb[] {
  /** Retarget a level's links so switching keeps the page shape you are on. */
  const asKind = (siblings: Sibling[], kind: 'tote-edit' | 'market-edit'): Sibling[] =>
    siblings.map((sibling) => (sibling.kind === 'section' ? sibling : { ...sibling, kind }))

  // The whole level, with the one you are on flagged rather than removed.
  const mark = (siblings: Sibling[], currentId: string | undefined): Sibling[] =>
    siblings.map((sibling) =>
      sibling.kind !== 'section' && sibling.id === currentId
        ? { ...sibling, current: true }
        : sibling,
    )

  const sections = (self: SectionPath): Sibling[] =>
    data.sections.map((sibling) =>
      sibling.kind === 'section' && sibling.to === self ? { ...sibling, current: true } : sibling,
    )

  const totes: Crumb = {
    label: m.totes_title(),
    href: { kind: 'section', to: '/totes' },
    siblings: sections('/totes'),
  }
  const markets: Crumb = {
    label: m.markets_title(),
    href: { kind: 'section', to: '/markets' },
    siblings: sections('/markets'),
  }
  const departments: Crumb = {
    label: m.departments_title(),
    href: { kind: 'section', to: '/departments' },
    siblings: sections('/departments'),
  }
  // A name that has not synced yet must not collapse the crumb to nothing.
  const named = (entity: { name: string } | undefined) => entity?.name ?? '…'

  switch (routeId) {
    case '/_authed/totes':
      return [totes]
    case '/_authed/tote/new':
      return [totes, { label: m.new_tote_title() }]
    case '/_authed/tote/$toteId':
      return [
        totes,
        { label: named(data.tote),
          Icon: ShoppingBag, siblings: mark(data.toteSiblings, data.tote?.id) },
      ]
    case '/_authed/tote_/$toteId/edit':
      return [
        totes,
        {
          label: named(data.tote),
          Icon: ShoppingBag,
          href: data.tote ? { kind: 'tote', id: data.tote.id } : undefined,
          // Picking another tote from here keeps you on its edit page.
          siblings: mark(asKind(data.toteSiblings, 'tote-edit'), data.tote?.id),
        },
        { label: m.edit() },
      ]

    case '/_authed/tote_/$toteId/market/$marketId':
      return [
        totes,
        {
          label: named(data.tote),
          Icon: ShoppingBag,
          href: data.tote ? { kind: 'tote', id: data.tote.id } : undefined,
          siblings: mark(
            data.toteSiblings.map((sibling) =>
              sibling.kind === 'tote' && data.market
                ? {
                    ...sibling,
                    kind: 'tote-market' as const,
                    toteId: sibling.id,
                    marketId: data.market.id,
                  }
                : sibling,
            ),
            data.tote?.id,
          ),
        },
        {
          label: named(data.market),
          Icon: Store,
          siblings: data.toteId
            ? mark(
                data.marketSiblings.map((sibling) =>
                  sibling.kind === 'market'
                    ? {
                        ...sibling,
                        kind: 'tote-market' as const,
                        toteId: data.toteId!,
                        marketId: sibling.id,
                      }
                    : sibling,
                ),
                data.market?.id,
              )
            : [],
        },
      ]

    case '/_authed/markets':
      return [markets]
    case '/_authed/market/new':
      return [markets, { label: m.new_market_title() }]
    case '/_authed/market/$marketId':
      return [
        markets,
        { label: named(data.market),
          Icon: Store, siblings: mark(data.marketSiblings, data.market?.id) },
      ]
    case '/_authed/market_/$marketId/edit':
      return [
        markets,
        {
          label: named(data.market),
          Icon: Store,
          href: data.market ? { kind: 'market', id: data.market.id } : undefined,
          siblings: mark(asKind(data.marketSiblings, 'market-edit'), data.market?.id),
        },
        { label: m.edit() },
      ]

    case '/_authed/departments':
      return [departments]
    case '/_authed/department/new':
      return [departments, { label: m.new_department_title() }]
    case '/_authed/department_/$departmentId/edit':
      return [
        departments,
        {
          label: named(data.department),
          Icon: Tag,
          siblings: mark(data.departmentSiblings, data.department?.id),
        },
        { label: m.edit() },
      ]

    case '/_authed/history':
      return [{ label: m.history_title(), siblings: sections('/history') }]
    case '/_authed/join/$toteId/$code':
      return [{ label: m.join() }]

    // '/_authed/' and anything unmapped: the logo already says home.
    default:
      return []
  }
}
