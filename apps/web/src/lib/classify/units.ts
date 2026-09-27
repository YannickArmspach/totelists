/**
 * The units an item can carry. NULL/undefined means "unspecified".
 *
 * Mirror of the CHECK constraint on `items.unit` in
 * services/trailbase/traildepot/migrations/main/U1790630000__tote_schema.sql —
 * keep the two lists in sync by hand.
 */
export const UNITS = ['piece', 'g', 'kg', 'ml', 'cl', 'l', 'pack', 'bunch'] as const

export type Unit = (typeof UNITS)[number]
