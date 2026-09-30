// @vitest-environment jsdom
/**
 * The catalog forms are uncontrolled (`defaultValue`), which is fine until the
 * SAME form is shown for a DIFFERENT row without unmounting — exactly what the
 * breadcrumb's switcher does: /tote/A/edit → /tote/B/edit keeps the route, so
 * React reuses the component and the inputs keep A's values.
 *
 * Each form guards against that itself rather than relying on every call site
 * to pass a key, so these tests are the contract for that guard.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { DepartmentRow, MarketRow, ToteRow } from '#/db/collections'
import { ToteForm } from './tote-form'
import { MarketForm } from './market-form'
import { DepartmentForm } from './department-form'

afterEach(cleanup)

const tote = (id: string, name: string, description: string): ToteRow => ({
  id,
  name,
  description,
  visibility: 'private',
})
const market = (id: string, name: string): MarketRow => ({ id, name, classification_hint: '' })
const department = (id: string, name: string): DepartmentRow => ({
  id,
  name,
  classification_hint: '',
  auto_created: 0,
})

const noop = () => {}

describe('forms follow the row they are given', () => {
  it('ToteForm re-reads every field when switched to another tote', () => {
    const { rerender } = render(
      <ToteForm tote={tote('a', 'Courses', 'weekly')} submitLabel="Save" onSubmit={noop} />,
    )
    expect(screen.getByDisplayValue('Courses')).toBeDefined()

    rerender(
      <ToteForm tote={tote('b', 'Garage', 'diy run')} submitLabel="Save" onSubmit={noop} />,
    )
    expect(screen.getByDisplayValue('Garage')).toBeDefined()
    expect(screen.getByDisplayValue('diy run')).toBeDefined()
    expect(screen.queryByDisplayValue('Courses')).toBeNull()
  })

  it('MarketForm re-reads when switched to another market', () => {
    const { rerender } = render(
      <MarketForm market={market('a', 'Biocoop')} submitLabel="Save" onSubmit={noop} />,
    )
    expect(screen.getByDisplayValue('Biocoop')).toBeDefined()

    rerender(<MarketForm market={market('b', 'Grand Frais')} submitLabel="Save" onSubmit={noop} />)
    expect(screen.getByDisplayValue('Grand Frais')).toBeDefined()
    expect(screen.queryByDisplayValue('Biocoop')).toBeNull()
  })

  it('DepartmentForm re-reads when switched to another preset', () => {
    const { rerender } = render(
      <DepartmentForm
        department={department('a', 'Produce')}
        submitLabel="Save"
        onSubmit={noop}
      />,
    )
    expect(screen.getByDisplayValue('Produce')).toBeDefined()

    rerender(
      <DepartmentForm department={department('b', 'Dairy')} submitLabel="Save" onSubmit={noop} />,
    )
    expect(screen.getByDisplayValue('Dairy')).toBeDefined()
    expect(screen.queryByDisplayValue('Produce')).toBeNull()
  })
})
