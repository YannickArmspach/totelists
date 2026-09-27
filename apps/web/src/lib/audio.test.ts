import { describe, expect, it } from 'vitest'
import { filenameForMime } from './audio'

describe('filenameForMime', () => {
  it('maps Chrome recordings (webm, with codec suffix)', () => {
    expect(filenameForMime('audio/webm;codecs=opus')).toBe('recording.webm')
    expect(filenameForMime('audio/webm')).toBe('recording.webm')
  })

  it('maps Safari recordings (mp4)', () => {
    expect(filenameForMime('audio/mp4')).toBe('recording.mp4')
  })

  it('maps the rest of the decodable set', () => {
    expect(filenameForMime('audio/ogg')).toBe('recording.ogg')
    expect(filenameForMime('audio/mpeg')).toBe('recording.mp3')
    expect(filenameForMime('audio/wav')).toBe('recording.wav')
  })

  it('falls back to .bin rather than guessing', () => {
    expect(filenameForMime('video/quicktime')).toBe('recording.bin')
    expect(filenameForMime(undefined)).toBe('recording.bin')
    expect(filenameForMime('')).toBe('recording.bin')
  })
})
