/**
 * The header's edit button, shown only where the page you are on has a
 * configuration screen behind it — and saying what it will edit, since the
 * same spot in the bar means "the tote" on one page and "the shop" on the
 * next.
 *
 * Editing used to hang off each list row (a gear per tote card, per market
 * row), which put the control far from the thing and cluttered every list.
 * One fixed spot in the bar is easier to find and costs each list nothing.
 *
 * Driven by the matched route id, like the breadcrumb, so adding a route
 * without an edit screen simply renders nothing.
 */
import { Link, useMatches } from '@tanstack/react-router'
import { Pencil } from 'lucide-react'

import { m } from '#/paraglide/messages'

const className =
  'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary'

function Label({ text }: { text: string }) {
  return (
    <>
      <Pencil className="size-4 shrink-0" />
      {/* The bar is crowded on a phone; the pencil alone carries it there. */}
      <span className="hidden sm:inline">{text}</span>
    </>
  )
}

export function EditAction() {
  const matches = useMatches()
  const leaf = matches.at(-1)
  const params = (leaf?.params ?? {}) as Record<string, string | undefined>

  switch (leaf?.routeId) {
    case '/_authed/tote/$toteId':
      return params.toteId ? (
        <Link
          to="/tote/$toteId/edit"
          params={{ toteId: params.toteId }}
          title={m.edit_tote_title()}
          className={className}
        >
          <Label text={m.edit_tote_title()} />
        </Link>
      ) : null

    // Standing in a shop — in a tote or across all of them — what there is to
    // configure is the shop: its name, hint and aisle order.
    case '/_authed/market/$marketId':
    case '/_authed/tote_/$toteId/market/$marketId':
      return params.marketId ? (
        <Link
          to="/market/$marketId/edit"
          params={{ marketId: params.marketId }}
          title={m.edit_market_title()}
          className={className}
        >
          <Label text={m.edit_market_title()} />
        </Link>
      ) : null

    default:
      return null
  }
}
