/**
 * A subscription stream the proxy can't break — and that never ends.
 *
 * The trailbase client's own subscribe() decodes each network chunk in
 * isolation (`decoder.decode(chunk)` with no carry-over): an SSE event split
 * across two chunks — routine through a proxy, never seen on localhost — or a
 * multi-byte UTF-8 character cut at a chunk boundary corrupts the parse and
 * kills the stream. Streams also just die in the field: Safari (especially iOS,
 * especially an installed PWA) tears down streaming fetches when the app is
 * backgrounded or the screen locks, proxies close idle SSE connections,
 * networks change.
 *
 * The collection adapter reconnects none of that — it reads our stream in a
 * loop and ends its sync session the moment the stream closes. And we cannot
 * repair that from outside: a collection's cleanup() puts every live query
 * depending on it into a FATAL error state (`fatalQueryError`), which no
 * subsequent startSyncImmediate() clears. Tearing collections down to resync
 * them permanently freezes the UI.
 *
 * So the healing happens here, underneath the adapter. A dead connection is
 * reopened in place and the gap is closed by re-listing the record API and
 * emitting the difference as ordinary change events. The adapter never sees
 * the stream end, the collection never stops syncing, live queries survive.
 */
import { client } from '#/lib/auth'

/** The event envelope the collection adapter consumes. */
export type ChangeEvent =
  | { Insert: object; seq?: number }
  | { Update: object; seq?: number }
  | { Delete: object; seq?: number }
  | { Error: unknown; seq?: number }

/** One page of a catch-up list; matches what the adapter's own loader uses. */
const PAGE_SIZE = 256

/** A connection that lasts this long counts as healthy, not as churn. */
const SETTLED_MS = 30_000

/*
  Every live stream, by record API name, with the lever that drops its
  connection — which makes the read loop reconnect and catch up. That is what
  "tap to refresh" and the resume handlers pull.
*/
const streams = new Map<string, () => void>()

const recovering = new Set<string>()
const recoveryListeners = new Set<() => void>()

/** True while any stream is reconnecting or replaying what it missed. */
export function isRecovering(): boolean {
  return recovering.size > 0
}

/** Fires when recovery starts or ends — the sync indicator listens. */
export function onRecoveringChange(listener: () => void): void {
  recoveryListeners.add(listener)
}

function setRecovering(apiName: string, value: boolean): void {
  if (value === recovering.has(apiName)) return
  if (value) recovering.add(apiName)
  else recovering.delete(apiName)
  for (const listener of recoveryListeners) listener()
}

/**
 * Drop every live connection. Each stream reconnects, re-lists and emits the
 * difference; nothing is torn down, so nothing needs rebuilding afterwards.
 */
export function refreshAllStreams(): void {
  // Mark first, so the indicator spins on the tap rather than a beat later.
  for (const apiName of streams.keys()) setRecovering(apiName, true)
  for (const refresh of streams.values()) refresh()
}

/**
 * Split accumulated SSE text into complete frames and the unfinished rest.
 * Pure, so the chunk-boundary behavior is unit-testable.
 */
export function splitSseFrames(buffer: string): { frames: string[]; rest: string } {
  const parts = buffer.split('\n\n')
  return { frames: parts.slice(0, -1), rest: parts.at(-1) ?? '' }
}

/** The data payloads of one frame; comment lines (`: ping`) fall away. */
export function dataLines(frame: string): string[] {
  return frame
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice(6))
}

function shallowEqual(a: object, b: object): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) return false
  }
  return true
}

/**
 * The events that turn `current` into `fresh` — what a reconnecting stream
 * missed while it was down. Rows that came back unchanged emit nothing: a
 * reconnect after a quiet minute must not churn every live query in the app.
 *
 * Pure, and the interesting half of this file to get wrong, so it is tested.
 */
export function diffRows<T extends { id: string }>(fresh: T[], current: T[]): ChangeEvent[] {
  const before = new Map(current.map((row) => [row.id, row]))
  const events: ChangeEvent[] = []
  for (const row of fresh) {
    const previous = before.get(row.id)
    if (!previous) events.push({ Insert: row })
    else if (!shallowEqual(previous, row)) events.push({ Update: row })
    before.delete(row.id)
  }
  // Whatever the server no longer has was deleted while we were away.
  for (const row of before.values()) events.push({ Delete: row })
  return events
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function openReader(apiName: string): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const response = await client.fetch(`/api/records/v1/${apiName}/subscribe/*`)
  const body = response.body
  if (!response.ok || !body) {
    throw new Error(`subscribe ${apiName}: ${response.status}`)
  }
  return body.getReader()
}

async function listAll<T>(apiName: string): Promise<T[]> {
  const api = client.records<T>(apiName)
  const rows: T[] = []
  let cursor: string | undefined
  while (true) {
    const page = await api.list({ pagination: { limit: PAGE_SIZE, cursor } })
    rows.push(...page.records)
    if (page.records.length < PAGE_SIZE || !page.cursor) return rows
    cursor = page.cursor
  }
}

export async function robustSubscribe<T extends { id: string }>(
  apiName: string,
  currentRows: () => T[],
): Promise<ReadableStream<ChangeEvent>> {
  let reader = await openReader(apiName)
  // One decoder for the life of a connection: `{ stream: true }` carries a
  // multi-byte character split across two chunks. A fresh one per chunk would
  // reintroduce the corruption this file exists to prevent.
  let decoder = new TextDecoder()
  let buffer = ''
  let prevSeq: number | undefined
  let cancelled = false
  /** Catch-up events waiting to be handed to the adapter. */
  let pending: ChangeEvent[] = []

  /** When the live connection was established, to tell churn from bad luck. */
  let connectedAt = Date.now()
  let churn = 0

  const refresh = () => void reader.cancel().catch(() => undefined)
  streams.set(apiName, refresh)

  /**
   * Reopen the connection, then close the gap. Subscribing BEFORE listing is
   * what makes this lossless: a write landing mid-list is already queued on the
   * new connection and gets applied after the diff, instead of falling into the
   * window between the two calls.
   */
  async function recover(): Promise<void> {
    setRecovering(apiName, true)
    decoder = new TextDecoder()
    buffer = ''
    prevSeq = undefined // A new connection restarts the server's sequence.

    /*
      A connection that barely lived is not bad luck, it is starvation: more
      streams than the browser will keep open at once (HTTP/1.1 allows six per
      origin, and this app wants seven). Reconnecting immediately only takes a
      slot from another collection, which then reconnects and takes it back —
      musical chairs at full speed. Every attempt "succeeds", so the error
      backoff below never engages; this is the one that slows the spin down.
    */
    if (Date.now() - connectedAt < SETTLED_MS) churn = Math.min(churn + 1, 6)
    else churn = 0
    // One quick death is a hiccup and reconnects at once; a pattern of them waits.
    if (churn > 1) await sleep(Math.min(500 * 2 ** churn, 15_000))

    for (let attempt = 0; !cancelled; attempt++) {
      try {
        reader = await openReader(apiName)
        connectedAt = Date.now()
        pending = diffRows(await listAll<T>(apiName), currentRows())
        setRecovering(apiName, false)
        return
      } catch {
        // Offline, or the server is down: keep trying, calmly and forever.
        await sleep(Math.min(1000 * 2 ** attempt, 30_000))
      }
    }
  }

  return new ReadableStream<ChangeEvent>({
    async pull(controller) {
      while (!cancelled) {
        if (pending.length > 0) {
          for (const event of pending) controller.enqueue(event)
          pending = []
          return
        }

        let done: boolean
        let value: Uint8Array | undefined
        try {
          ;({ done, value } = await reader.read())
        } catch {
          done = true // A broken read is a dead connection like any other.
        }
        if (cancelled) return
        if (done) {
          await recover()
          continue
        }

        buffer += decoder.decode(value, { stream: true })
        const { frames, rest } = splitSseFrames(buffer)
        buffer = rest

        const batch: ChangeEvent[] = []
        let lost = false
        for (const frame of frames) {
          for (const payload of dataLines(frame)) {
            let event: ChangeEvent
            try {
              event = JSON.parse(payload) as ChangeEvent
            } catch {
              // A frame we can't read is a frame we lost.
              lost = true
              continue
            }
            const seq = event.seq
            if (typeof seq === 'number') {
              // The server numbers events; a gap means something was dropped
              // upstream and the local state can no longer be trusted.
              if (prevSeq !== undefined && seq !== prevSeq + 1) lost = true
              prevSeq = seq
            }
            if ('Error' in event) {
              lost = true
              continue
            }
            batch.push(event)
          }
        }
        // A batch with a hole in it is not worth applying: the re-list that
        // follows is a complete answer, so drop this one and let the diff be
        // the truth. Held back until the whole batch parses for exactly that
        // reason — half of it must not escape before we know.
        if (lost) {
          await recover()
          continue
        }
        if (batch.length > 0) {
          for (const event of batch) controller.enqueue(event)
          return
        }
      }
    },
    cancel() {
      cancelled = true
      if (streams.get(apiName) === refresh) streams.delete(apiName)
      setRecovering(apiName, false)
      void reader.cancel().catch(() => undefined)
    },
  })
}
