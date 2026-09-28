/**
 * A subscription stream the proxy can't break.
 *
 * The trailbase client's own subscribe() decodes each network chunk in
 * isolation (`decoder.decode(chunk)` with no carry-over): an SSE event split
 * across two chunks — routine through a proxy, never seen on localhost — or a
 * multi-byte UTF-8 character cut at a chunk boundary corrupts the parse and
 * kills the stream. And the collection adapter never reconnects a dead
 * stream, so realtime silently stops until a manual refresh.
 *
 * This replacement buffers across chunks, decodes incrementally, watches the
 * server's `seq` for gaps, and reports every unexpected end through the drop
 * handler (which schedules a resync). A consumer-initiated cancel — what a
 * resync's cleanup does — is not a drop.
 */
import { client } from '#/lib/auth'

/** The event envelope the collection adapter consumes. */
export type ChangeEvent =
  | { Insert: object; seq?: number }
  | { Update: object; seq?: number }
  | { Delete: object; seq?: number }
  | { Error: unknown; seq?: number }

let dropHandler: (() => void) | undefined

/** Late-bound to avoid an import cycle (resync → collections → here). */
export function setDropHandler(handler: () => void): void {
  dropHandler = handler
}

function dropped(): void {
  dropHandler?.()
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

export async function robustSubscribe(apiName: string): Promise<ReadableStream<ChangeEvent>> {
  const response = await client.fetch(`/api/records/v1/${apiName}/subscribe/*`)
  const body = response.body
  if (!response.ok || !body) {
    throw new Error(`subscribe ${apiName}: ${response.status}`)
  }

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let prevSeq: number | undefined
  let cancelled = false

  return new ReadableStream<ChangeEvent>({
    async pull(controller) {
      while (true) {
        let done: boolean
        let value: Uint8Array | undefined
        try {
          ;({ done, value } = await reader.read())
        } catch (error) {
          controller.error(error)
          if (!cancelled) dropped()
          return
        }
        if (done) {
          controller.close()
          if (!cancelled) dropped()
          return
        }

        buffer += decoder.decode(value, { stream: true })
        const { frames, rest } = splitSseFrames(buffer)
        buffer = rest

        let enqueued = false
        for (const frame of frames) {
          for (const payload of dataLines(frame)) {
            let event: ChangeEvent
            try {
              event = JSON.parse(payload) as ChangeEvent
            } catch {
              // A frame we can't read is a frame we lost.
              dropped()
              continue
            }
            const seq = event.seq
            if (typeof seq === 'number') {
              // The server numbers events; a gap means something was dropped
              // upstream and the local state can no longer be trusted.
              if (prevSeq !== undefined && seq !== prevSeq + 1) dropped()
              prevSeq = seq
            }
            if ('Error' in event) {
              dropped()
              continue
            }
            controller.enqueue(event)
            enqueued = true
          }
        }
        if (enqueued) return
      }
    },
    cancel() {
      cancelled = true
      void reader.cancel().catch(() => undefined)
    },
  })
}
