/**
 * Proxy to the Whisper service.
 *
 * The browser can't call Whisper itself: the service has no CORS headers and a
 * single static API key that must never reach a devtools tab. The blob lands
 * here, and this route forwards it with the key from the server's environment.
 *
 * Whisper answers 503 while its model is still loading after a cold start, so
 * that one status is retried; everything else is the caller's problem.
 */
import { createFileRoute } from '@tanstack/react-router'
import { filenameForMime } from '#/lib/audio'

const MAX_BYTES = 15 * 1024 * 1024
const COLD_START_RETRIES = 3
const RETRY_DELAY_MS = 2000

const FAKE_TRANSCRIPT =
  'deux kilos de tomates, du basilic, trois mozzarellas et des tablettes lave-vaisselle'

async function transcribe(request: Request): Promise<Response> {
  if (process.env.FAKE_AI === '1') {
    return Response.json({ text: FAKE_TRANSCRIPT })
  }

  const apiKey = process.env.WHISPER_API_KEY
  if (!apiKey) return Response.json({ error: 'WHISPER_API_KEY is not set' }, { status: 500 })
  const baseUrl = process.env.WHISPER_URL ?? 'https://whisper-production.dev.ynk.one'

  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_BYTES) return Response.json({ error: 'audio too large' }, { status: 413 })

  const incoming = await request.formData()
  const audio = incoming.get('audio')
  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: 'missing audio' }, { status: 400 })
  }
  if (audio.size > MAX_BYTES) return Response.json({ error: 'audio too large' }, { status: 413 })
  const language = incoming.get('language')

  const form = new FormData()
  form.append('file', audio, filenameForMime(audio.type))
  if (typeof language === 'string' && language) form.append('language', language)

  let upstream: Response | undefined
  for (let attempt = 0; attempt < COLD_START_RETRIES; attempt++) {
    upstream = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })
    // 503 = model still loading after a cold start; worth waiting out.
    if (upstream.status !== 503) break
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
  }

  if (!upstream || !upstream.ok) {
    return Response.json(
      { error: `transcription failed (${upstream?.status ?? 'no response'})` },
      { status: 502 },
    )
  }

  const { text } = (await upstream.json()) as { text: string }
  return Response.json({ text })
}

export const Route = createFileRoute('/api/transcribe')({
  server: {
    handlers: {
      POST: ({ request }) => transcribe(request),
    },
  },
})
