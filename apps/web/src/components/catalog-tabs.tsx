/**
 * The Markets / Departments switch atop both catalog pages — the two halves of
 * the same catalog, managed side by side.
 */
import { Link } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'

export function CatalogTabs() {
  const tab =
    'flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium text-muted-foreground [&.active]:bg-card [&.active]:text-foreground [&.active]:shadow-xs'
  return (
    <nav className="flex gap-1 rounded-xl bg-secondary p-1">
      <Link to="/markets" className={tab} activeOptions={{ exact: true }}>
        {m.markets_title()}
      </Link>
      <Link to="/departments" className={tab}>
        {m.departments_title()}
      </Link>
    </nav>
  )
}
