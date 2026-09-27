/**
 * The system prompt for the item classifier.
 *
 * Pure function of the catalog so it is unit-testable: every market and
 * department id the model is allowed to answer with appears here, with its
 * classification_hint, in the tote's own attach order.
 */
import type { ClassifyMarket } from './schema'

const RULES = `You split a spoken shopping note (French or English — transcripts may be messy) into individual shopping items and route each to a market and department.

Rules:
- One output item per distinct product. Expand enumerations: "tomatoes, basil and two mozzarellas" is 3 items.
- title is the bare product name, singular, in the transcript's language. Ignore filler speech.
- Parse spoken quantities: "deux kilos de tomates" → number 2, unit "kg"; "trois yaourts" → number 3, unit null.
- price_cents ONLY when a price is explicitly spoken ("à deux euros" → 200). Never guess prices.
- description carries qualifiers that fit nowhere else (brand, ripeness, "the good ones").
- The MARKETS list below is the only valid routing destination. Use each market's and department's hint to decide what belongs where. NEVER invent an id.
- If no market clearly fits an item, market_id is null (the user will route it by hand).
- If the market fits but none of its listed departments does, set department_id to null and propose new_department_name: a short department name in the same language as the market's existing departments (or the transcript), plus new_department_hint, one line saying what belongs there. Prefer an existing department whenever one plausibly fits.
- Never route an item to a department of a different market.`

function departmentLine(dept: { id: string; name: string; classification_hint: string }): string {
  const hint = dept.classification_hint ? ` — ${dept.classification_hint}` : ''
  return `  - department id: ${dept.id} | ${dept.name}${hint}`
}

function marketBlock(market: ClassifyMarket): string {
  const hint = market.classification_hint ? ` — ${market.classification_hint}` : ''
  const lines = [`- market id: ${market.id} | ${market.name}${hint}`]
  for (const dept of market.departments) lines.push(departmentLine(dept))
  if (market.departments.length === 0) lines.push('  (no departments yet)')
  return lines.join('\n')
}

export function buildClassifyPrompt(markets: ClassifyMarket[]): string {
  if (markets.length === 0) {
    return `${RULES}

MARKETS: none. This list has no markets: parse the items (title, number, unit, description, price_cents) and leave market_id, department_id and new_department_name null on every item.`
  }
  return `${RULES}

MARKETS:
${markets.map(marketBlock).join('\n')}`
}
