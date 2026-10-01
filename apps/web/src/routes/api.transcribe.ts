/**
 * Proxy to Open WebUI's built-in faster-whisper transcription.
 *
 * The browser can't call it directly: the per-user API keys live in TrailBase
 * and must never reach a devtools tab. The blob lands here with the caller's
 * TrailBase JWT; this route resolves (or provisions) their Open WebUI account
 * and forwards the audio with their personal key, so usage is attributed to
 * them.
 *
 * A 503 while the model is still loading after a cold start is retried;
 * everything else is the caller's problem.
 */
import { createFileRoute } from '@tanstack/react-router'
import { filenameForMime } from '#/lib/audio'
import { getOrProvisionApiKey, openWebUiUrl, verifyCaller } from '#/lib/server/ai-account'

const MAX_BYTES = 15 * 1024 * 1024
const COLD_START_RETRIES = 3
const RETRY_DELAY_MS = 2000

const FAKE_TRANSCRIPT =
  'deux kilos de tomates, du basilic, trois mozzarellas et des tablettes lave-vaisselle'

async function transcribe(request: Request): Promise<Response> {
  if (process.env.FAKE_AI === '1') {
    return Response.json({ text: FAKE_TRANSCRIPT })
  }

  const caller = await verifyCaller(request)
  if (!caller) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_BYTES) return Response.json({ error: 'audio too large' }, { status: 413 })

  const incoming = await request.formData()
  const audio = incoming.get('audio')
  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: 'missing audio' }, { status: 400 })
  }
  if (audio.size > MAX_BYTES) return Response.json({ error: 'audio too large' }, { status: 413 })
  const language = incoming.get('language')

  let apiKey: string
  try {
    apiKey = await getOrProvisionApiKey(caller)
  } catch (err) {
    console.error('ai account provisioning failed:', err)
    return Response.json({ error: 'ai account unavailable' }, { status: 502 })
  }

  const form = new FormData()
  form.append('file', audio, filenameForMime(audio.type))
  if (typeof language === 'string' && language) form.append('language', language)

  let upstream: Response | undefined
  for (let attempt = 0; attempt < COLD_START_RETRIES; attempt++) {
    upstream = await fetch(`${openWebUiUrl()}/api/v1/audio/transcriptions`, {
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
