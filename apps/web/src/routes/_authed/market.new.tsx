/**
 * Create a market, then go to its edit page — where departments get attached,
 * which is the next thing anyone wants after naming a store.
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { marketsCollection } from '#/db/collections'
import { useCatalogMarkets } from '#/db/hooks'
import { currentUserId } from '#/lib/auth'
import { newId } from '#/db/ids'
import { MarketForm } from '#/components/market-form'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/market/new')({ component: NewMarketPage })

function NewMarketPage() {
  const navigate = useNavigate()
  const markets = useCatalogMarkets()

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="text-xl font-semibold">{m.new_market_title()}</h1>
      <MarketForm
        submitLabel={m.create()}
        onSubmit={async (fields) => {
          const marketId = newId()
          await marketsCollection.insert({
            id: marketId,
            created_by: currentUserId(),
            name: fields.name,
            classification_hint: fields.classification_hint,
            sort: markets.length + 1,
          }).isPersisted.promise
          await navigate({ to: '/market/$marketId/edit', params: { marketId } })
        }}
      />
    </div>
  )
}
