import { describe, expect, it } from 'vitest'
import { classifyResponseSchema, postValidate, type ClassifyMarket } from './schema'
import { UNITS } from './units'

const MARKETS: ClassifyMarket[] = [
  {
    id: 'mkt-A',
    name: 'Grand Frais',
    classification_hint: 'fruits, légumes',
    departments: [
      { id: 'dep-1', name: 'Fruits & légumes', classification_hint: '' },
      { id: 'dep-2', name: 'Crèmerie', classification_hint: '' },
    ],
  },
]

/** The shape Meridian actually returns for the FAKE_AI transcript. */
const GOLDEN = {
  items: [
    {
      title: 'tomates',
      number: 2,
      unit: 'kg',
      description: null,
      price_cents: null,
      market_id: 'mkt-A',
      department_id: 'dep-1',
      new_department_name: null,
      new_department_hint: null,
      confidence: 0.95,
    },
    {
      title: 'tablettes lave-vaisselle',
      market_id: 'mkt-A',
      department_id: null,
      new_department_name: 'Entretien',
      new_department_hint: 'produits ménagers',
    },
  ],
}

describe('classifyResponseSchema', () => {
  it('accepts a golden payload', () => {
    expect(() => classifyResponseSchema.parse(GOLDEN)).not.toThrow()
  })

  it('rejects an unknown unit', () => {
    expect(() =>
      classifyResponseSchema.parse({
        items: [{ title: 'x', unit: 'stone', market_id: null, department_id: null }],
      }),
    ).toThrow()
  })

  it('covers exactly the units the SQL CHECK allows', () => {
    // Mirror of the CHECK on items.unit in the tote schema migration.
    expect(UNITS).toEqual(['piece', 'g', 'kg', 'ml', 'cl', 'l', 'pack', 'bunch'])
  })
})

describe('postValidate', () => {
  it('passes valid routing through', () => {
    const [item] = postValidate(classifyResponseSchema.parse(GOLDEN), MARKETS)
    expect(item).toMatchObject({ market_id: 'mkt-A', department_id: 'dep-1', number: 2, unit: 'kg' })
  })

  it('nulls a hallucinated market id and everything under it', () => {
    const [item] = postValidate(
      {
        items: [
          {
            title: 'x',
            market_id: 'mkt-INVENTED',
            department_id: 'dep-1',
            new_department_name: 'Nope',
          },
        ],
      },
      MARKETS,
    )
    expect(item).toMatchObject({ market_id: null, department_id: null, new_department_name: null })
  })

  it("nulls a department that belongs to a different market", () => {
    const [item] = postValidate(
      { items: [{ title: 'x', market_id: 'mkt-A', department_id: 'dep-OTHER' }] },
      MARKETS,
    )
    expect(item).toMatchObject({ market_id: 'mkt-A', department_id: null })
  })

  it('collapses a proposed department onto a case-insensitive name match', () => {
    const [item] = postValidate(
      {
        items: [
          {
            title: 'x',
            market_id: 'mkt-A',
            department_id: null,
            new_department_name: 'crèmerie',
            new_department_hint: 'dupe',
          },
        ],
      },
      MARKETS,
    )
    expect(item).toMatchObject({ department_id: 'dep-2', new_department_name: null, new_department_hint: null })
  })

  it('keeps a genuinely new department proposal, with its hint', () => {
    const [item] = postValidate(
      {
        items: [
          {
            title: 'x',
            market_id: 'mkt-A',
            department_id: null,
            new_department_name: 'Entretien',
            new_department_hint: 'produits ménagers',
          },
        ],
      },
      MARKETS,
    )
    expect(item).toMatchObject({ new_department_name: 'Entretien', new_department_hint: 'produits ménagers' })
  })

  it('drops the proposal when an explicit department id also came back', () => {
    const [item] = postValidate(
      {
        items: [
          {
            title: 'x',
            market_id: 'mkt-A',
            department_id: 'dep-1',
            new_department_name: 'Entretien',
          },
        ],
      },
      MARKETS,
    )
    expect(item).toMatchObject({ department_id: 'dep-1', new_department_name: null })
  })
})
