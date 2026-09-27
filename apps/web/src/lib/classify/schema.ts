/**
 * The classification contract, in both dialects:
 *
 * - CLASSIFY_SCHEMA is the JSON Schema handed to Meridian's structured output
 *   (`output_config.format.json_schema`) — the model cannot answer anything
 *   that doesn't validate against it.
 * - `classifyResponseSchema` is the zod twin the server re-validates with
 *   before trusting the payload (belt and braces: Meridian already validated).
 *
 * `postValidate` then enforces what a schema cannot: ids must be ones we sent,
 * a department must belong to its market, and a proposed department that
 * matches an existing name (case-insensitively) collapses onto that id.
 */
import { z } from 'zod'
import { UNITS, type Unit } from './units'

export interface ClassifyDepartment {
  id: string
  name: string
  classification_hint: string
}

export interface ClassifyMarket {
  id: string
  name: string
  classification_hint: string
  departments: ClassifyDepartment[]
}

export interface ClassifyRequest {
  transcript: string
  language?: string
  markets: ClassifyMarket[]
}

export const CLASSIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'market_id', 'department_id'],
        properties: {
          title: {
            type: 'string',
            description: "Bare product name, singular, in the transcript's language",
          },
          number: { type: ['number', 'null'], description: 'Quantity, if spoken' },
          unit: {
            enum: [...UNITS, null],
            description: 'Unit of the quantity; null when unspecified',
          },
          description: {
            type: ['string', 'null'],
            description: "Qualifiers that don't fit title/number/unit (brand, ripeness…)",
          },
          price_cents: {
            type: ['integer', 'null'],
            description: 'Price in cents, ONLY if explicitly spoken',
          },
          market_id: {
            type: ['string', 'null'],
            description: 'id of one provided market, or null if none fits',
          },
          department_id: {
            type: ['string', 'null'],
            description: 'id of a department OF THAT market, or null',
          },
          new_department_name: {
            type: ['string', 'null'],
            description:
              'Short new department name, ONLY when market_id is set and none of its departments fits',
          },
          new_department_hint: {
            type: ['string', 'null'],
            description: 'One line saying what belongs in the proposed department',
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
  },
} as const

export const parsedItemSchema = z.object({
  title: z.string().min(1),
  number: z.number().positive().nullish(),
  unit: z.enum(UNITS).nullish(),
  description: z.string().nullish(),
  price_cents: z.int().min(0).nullish(),
  market_id: z.string().nullish(),
  department_id: z.string().nullish(),
  new_department_name: z.string().nullish(),
  new_department_hint: z.string().nullish(),
  confidence: z.number().min(0).max(1).nullish(),
})

export const classifyResponseSchema = z.object({
  items: z.array(parsedItemSchema),
})

export interface ParsedItem {
  title: string
  number: number | null
  unit: Unit | null
  description: string
  price_cents: number | null
  market_id: string | null
  department_id: string | null
  new_department_name: string | null
  new_department_hint: string | null
  confidence: number | null
}

/**
 * Ground the model's answer in the catalog that was actually offered.
 *
 * The model must echo record ids exactly; anything unknown is treated as "no
 * opinion" rather than an error, so a hallucinated id degrades to an unrouted
 * item instead of a broken insert.
 */
export function postValidate(
  raw: z.infer<typeof classifyResponseSchema>,
  markets: ClassifyMarket[],
): ParsedItem[] {
  const byId = new Map(markets.map((market) => [market.id, market]))

  return raw.items.map((item) => {
    const market = item.market_id ? byId.get(item.market_id) : undefined
    let departmentId = item.department_id ?? null
    let newName = item.new_department_name?.trim() || null
    let newHint = item.new_department_hint?.trim() || null

    if (!market) {
      // No (valid) market: nothing below it can stand either.
      departmentId = null
      newName = null
      newHint = null
    } else {
      if (departmentId && !market.departments.some((d) => d.id === departmentId)) {
        departmentId = null
      }
      if (newName) {
        // A proposal that matches an existing department is that department.
        const existing = market.departments.find(
          (d) => d.name.localeCompare(newName!, undefined, { sensitivity: 'accent' }) === 0,
        )
        if (existing) {
          departmentId = existing.id
          newName = null
          newHint = null
        }
      }
      // An id wins over a proposal; never both.
      if (departmentId) {
        newName = null
        newHint = null
      }
    }

    return {
      title: item.title.trim(),
      number: item.number ?? null,
      unit: item.unit ?? null,
      description: item.description?.trim() ?? '',
      price_cents: item.price_cents ?? null,
      market_id: market?.id ?? null,
      department_id: departmentId,
      new_department_name: newName,
      new_department_hint: newName ? newHint : null,
      confidence: item.confidence ?? null,
    }
  })
}
