import { describe, expect, it } from 'vitest'
import { newId } from '#/db/ids'
import { fromUrlId, toUrlId } from './url-id'

describe('url ids', () => {
  it('round-trips a real generated id', () => {
    const id = newId()
    expect(fromUrlId(toUrlId(id))).toBe(id)
  })

  it('strips exactly the padding', () => {
    expect(toUrlId('AaDoNrIBeu2LdM7tACTyHw==')).toBe('AaDoNrIBeu2LdM7tACTyHw')
    expect(fromUrlId('AaDoNrIBeu2LdM7tACTyHw')).toBe('AaDoNrIBeu2LdM7tACTyHw==')
  })

  it('keeps base64url characters untouched', () => {
    // The `-` and `_` are load-bearing: standard base64 is rejected with 400.
    const id = 'AaDu4f-eec-qjJehvYaeCw=='
    expect(toUrlId(id)).toBe('AaDu4f-eec-qjJehvYaeCw')
    expect(fromUrlId(toUrlId(id))).toBe(id)
  })

  it('is idempotent, so an already-short id survives a second pass', () => {
    const short = toUrlId(newId())
    expect(toUrlId(short)).toBe(short)
  })

  it('leaves anything that is not a padded 16-byte id alone', () => {
    // Invite codes and stray params must pass through unharmed.
    expect(fromUrlId('abc')).toBe('abc')
    expect(toUrlId('abc')).toBe('abc')
  })
})
