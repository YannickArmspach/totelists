/**
 * The recovery path, driven end to end against a fake TrailBase.
 *
 * The point of robustSubscribe is that the stream it hands the collection
 * adapter NEVER ends — a dead connection is reopened underneath and the gap is
 * replayed as change events. That behaviour only shows up over time, across a
 * connect → event → drop → reconnect → catch-up sequence, so it gets a test
 * that actually plays the sequence rather than one that inspects the pieces.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** SSE bodies the fake server hands out, one per connection, in order. */
let bodies: Array<() => ReadableStream<Uint8Array>> = []
let listPages: Array<{ records: Array<{ id: string; title?: string }>; cursor?: string }> = []
let subscribeCalls = 0
let listCalls = 0
/** Call order across both endpoints, for the subscribe-before-list guarantee. */
let order: string[] = []

vi.mock('#/lib/auth', () => ({
  client: {
    fetch: () => {
      const make = bodies[subscribeCalls++]
      if (!make) throw new Error('no connection left')
      return Promise.resolve({ ok: true, body: make() })
    },
    records: () => ({
      list: () => {
        order.push('list')
        const page = listPages[listCalls++] ?? { records: [] }
        return Promise.resolve(page)
      },
    }),
  },
}))

const { robustSubscribe } = await import('./subscribe')

const encoder = new TextEncoder()

/** A stream that emits the given SSE frames then ends — a dropped connection. */
function sse(...frames: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame))
      controller.close()
    },
  })
}

/** A stream that emits nothing and stays open — a healthy idle connection. */
function idle(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({ start() {} })
}

async function take(stream: ReadableStream<unknown>, count: number): Promise<unknown[]> {
  const reader = stream.getReader()
  const out: unknown[] = []
  while (out.length < count) {
    const { done, value } = await reader.read()
    if (done) break
    out.push(value)
  }
  void reader.cancel().catch(() => undefined)
  return out
}

beforeEach(() => {
  bodies = []
  listPages = []
  subscribeCalls = 0
  listCalls = 0
  order = []
})

describe('robustSubscribe', () => {
  it('passes live events straight through', async () => {
    bodies = [() => sse('data: {"Insert":{"id":"a"},"seq":1}\n\n')]
    const stream = await robustSubscribe('items', () => [])
    expect(await take(stream, 1)).toEqual([{ Insert: { id: 'a' }, seq: 1 }])
  })

  it('reopens a dropped connection and replays the gap', async () => {
    // First connection delivers one event, then dies.
    bodies = [() => sse('data: {"Insert":{"id":"a"},"seq":1}\n\n'), () => idle()]
    // The catch-up list finds a row we never saw, and no longer has 'stale'.
    listPages = [{ records: [{ id: 'a' }, { id: 'missed' }] }]

    const stream = await robustSubscribe('items', () => [{ id: 'a' }, { id: 'stale' }])
    const events = await take(stream, 3)

    expect(events).toEqual([
      { Insert: { id: 'a' }, seq: 1 },
      { Insert: { id: 'missed' } },
      { Delete: { id: 'stale' } },
    ])
    expect(subscribeCalls).toBe(2) // It really did reconnect.
  })

  it('subscribes before listing, so a mid-list write cannot be lost', async () => {
    bodies = [
      () => sse(''), // Dies straight away, forcing a recovery.
      () => {
        order.push('subscribe')
        return idle()
      },
    ]
    listPages = [{ records: [{ id: 'a' }] }]

    const stream = await robustSubscribe('items', () => [])
    void take(stream, 1)
    await vi.waitFor(() => expect(order).toEqual(['subscribe', 'list']))
  })

  it('recovers instead of ending when the server reports a seq gap', async () => {
    bodies = [() => sse('data: {"Insert":{"id":"a"},"seq":1}\n\ndata: {"Insert":{"id":"c"},"seq":9}\n\n'), () => idle()]
    listPages = [{ records: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }]

    const stream = await robustSubscribe('items', () => [{ id: 'a' }])
    const events = await take(stream, 2)

    // The gap discards the batch and lets the re-list be the truth.
    expect(events).toEqual([{ Insert: { id: 'b' } }, { Insert: { id: 'c' } }])
    expect(subscribeCalls).toBe(2)
  })

  it('reassembles an event split across two chunks', async () => {
    bodies = [
      () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"Insert":{"id":"a","title":"cr'))
            controller.enqueue(encoder.encode('ème"},"seq":1}\n\n'))
            controller.close()
          },
        }),
      () => idle(),
    ]
    listPages = [{ records: [] }]

    const stream = await robustSubscribe('items', () => [])
    const events = await take(stream, 1)
    expect(events).toEqual([{ Insert: { id: 'a', title: 'crème' }, seq: 1 }])
  })
})
