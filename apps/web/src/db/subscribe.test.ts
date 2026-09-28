import { describe, expect, it } from 'vitest'
import { dataLines, splitSseFrames } from './subscribe'

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
