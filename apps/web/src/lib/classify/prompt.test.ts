import { describe, expect, it } from 'vitest'
import { buildClassifyPrompt } from './prompt'
import type { ClassifyMarket } from './schema'

const MARKETS: ClassifyMarket[] = [
  {
    id: 'mkt-A',
    name: 'Grand Frais',
    classification_hint: 'fruits, légumes, fromagerie',
    departments: [
      { id: 'dep-1', name: 'Fruits & légumes', classification_hint: 'produits frais du primeur' },
      { id: 'dep-2', name: 'Crèmerie', classification_hint: '' },
    ],
  },
  { id: 'mkt-B', name: 'Bricorama', classification_hint: 'outils, visserie', departments: [] },
]

describe('buildClassifyPrompt', () => {
  it('names every market and department id, name and hint', () => {
    const prompt = buildClassifyPrompt(MARKETS)
    for (const market of MARKETS) {
      expect(prompt).toContain(market.id)
      expect(prompt).toContain(market.name)
      if (market.classification_hint) expect(prompt).toContain(market.classification_hint)
      for (const dept of market.departments) {
        expect(prompt).toContain(dept.id)
        expect(prompt).toContain(dept.name)
        if (dept.classification_hint) expect(prompt).toContain(dept.classification_hint)
      }
    }
  })

  it('keeps the attach order stable', () => {
    const prompt = buildClassifyPrompt(MARKETS)
    expect(prompt.indexOf('mkt-A')).toBeLessThan(prompt.indexOf('mkt-B'))
  })

  it('marks a department-less market rather than omitting it', () => {
    expect(buildClassifyPrompt(MARKETS)).toContain('(no departments yet)')
  })

  it('switches to flat parsing when there are no markets', () => {
    const prompt = buildClassifyPrompt([])
    expect(prompt).toContain('MARKETS: none')
    expect(prompt).toContain('leave market_id')
  })
})
