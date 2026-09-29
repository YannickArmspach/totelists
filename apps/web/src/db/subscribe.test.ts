import { describe, expect, it } from 'vitest'
import { dataLines, diffRows, splitSseFrames } from './subscribe'

describe('splitSseFrames', () => {
  it('keeps a partial frame in the buffer instead of parsing it', () => {
    const { frames, rest } = splitSseFrames('data: {"Update":{"id":"a"')
    expect(frames).toEqual([])
    expect(rest).toBe('data: {"Update":{"id":"a"')
  })

  it('completes the frame once the rest of the chunk arrives', () => {
    const first = splitSseFrames('data: {"Upd')
    const second = splitSseFrames(first.rest + 'ate":{"id":"a"},"seq":1}\n\n')
    expect(second.frames).toEqual(['data: {"Update":{"id":"a"},"seq":1}'])
    expect(second.rest).toBe('')
  })

  it('yields several frames from one chunk', () => {
    const { frames, rest } = splitSseFrames('data: {"seq":1}\n\ndata: {"seq":2}\n\ndata: {"se')
    expect(frames).toEqual(['data: {"seq":1}', 'data: {"seq":2}'])
    expect(rest).toBe('data: {"se')
  })
})

describe('dataLines', () => {
  it('drops keepalive comments', () => {
    expect(dataLines(': ping')).toEqual([])
    expect(dataLines(':')).toEqual([])
  })

  it('extracts the payload', () => {
    expect(dataLines('data: {"Insert":{"id":"x"}}')).toEqual(['{"Insert":{"id":"x"}}'])
  })
})

describe('diffRows', () => {
  it('emits nothing when the reconnect found no changes', () => {
    const rows = [{ id: 'a', title: 'Milk' }, { id: 'b', title: 'Eggs' }]
    // Fresh objects, same values — a re-list never returns identical references.
    expect(diffRows(rows.map((row) => ({ ...row })), rows)).toEqual([])
  })

  it('inserts rows other members added while we were away', () => {
    expect(diffRows([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }])).toEqual([{ Insert: { id: 'b' } }])
  })

  it('updates rows whose fields moved on', () => {
    expect(diffRows([{ id: 'a', status: 'bought' }], [{ id: 'a', status: 'buy' }])).toEqual([
      { Update: { id: 'a', status: 'bought' } },
    ])
  })

  it('deletes rows the server no longer has', () => {
    expect(diffRows([{ id: 'a' }], [{ id: 'a' }, { id: 'gone' }])).toEqual([
      { Delete: { id: 'gone' } },
    ])
  })

  it('notices a field that only one side has', () => {
    // A key present-but-undefined must not read as equal to a missing key.
    expect(diffRows([{ id: 'a', note: 'x' }], [{ id: 'a' }])).toEqual([
      { Update: { id: 'a', note: 'x' } },
    ])
  })

  it('handles the first sync after a total loss', () => {
    expect(diffRows([{ id: 'a' }, { id: 'b' }], [])).toEqual([
      { Insert: { id: 'a' } },
      { Insert: { id: 'b' } },
    ])
  })
})
