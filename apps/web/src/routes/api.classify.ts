/**
 * One model call per transcript: split the note into items and route each to a
 * market/department of the active tote.
 *
 * The call goes through Open WebUI's authenticated Ollama proxy with the
 * caller's personal API key (provisioned on first use), not the OpenAI-style
 * /api/chat/completions: the proxy forwards Ollama-native fields verbatim,
 * which this route depends on twice —
 * - `format`: the JSON schema enforced by constrained decoding, so the reply
 *   body IS the validated JSON;
 * - `think: false`: qwen3 is a thinking model, and reasoning tokens would
 *   multiply latency for zero triage benefit.
 */
import { createFileRoute } from '@tanstack/react-router'
import {
  CLASSIFY_SCHEMA,
  classifyResponseSchema,
  postValidate,
  type ClassifyMarket,
  type ClassifyRequest,
  type ParsedItem,
} from '#/lib/classify/schema'
import { buildClassifyPrompt } from '#/lib/classify/prompt'
import { getOrProvisionApiKey, openWebUiUrl, verifyCaller } from '#/lib/server/ai-account'

const COLD_START_RETRIES = 3
const RETRY_DELAY_MS = 2000

function fakeItems(markets: ClassifyMarket[]): ParsedItem[] {
  const market = markets[0]
  const dept = market?.departments[0]
  const item = (title: string, extra: Partial<ParsedItem> = {}): ParsedItem => ({
    title,
    number: null,
    unit: null,
    description: '',
    price_cents: null,
    market_id: market?.id ?? null,
    department_id: dept?.id ?? null,
    new_department_name: null,
    new_department_hint: null,
    confidence: 0.9,
    ...extra,
  })
  return [
    item('tomates', { number: 2, unit: 'kg' }),
    item('basilic'),
    item('mozzarella', { number: 3 }),
    item('tablettes lave-vaisselle', {
      department_id: null,
      new_department_name: market ? 'Entretien' : null,
      new_department_hint: market ? 'produits ménagers, lessive, vaisselle' : null,
    }),
  ]
}

async function classify(request: Request): Promise<Response> {
  const body = (await request.json()) as ClassifyRequest
  if (!body || typeof body.transcript !== 'string' || !body.transcript.trim()) {
    return Response.json({ error: 'missing transcript' }, { status: 400 })
  }
  const markets: ClassifyMarket[] = Array.isArray(body.markets) ? body.markets : []

  if (process.env.FAKE_AI === '1') {
    return Response.json({ items: fakeItems(markets) })
  }

  const caller = await verifyCaller(request)
  if (!caller) return Response.json({ error: 'unauthorized' }, { status: 401 })

  let apiKey: string
  try {
    apiKey = await getOrProvisionApiKey(caller)
  } catch (err) {
    console.error('ai account provisioning failed:', err)
    return Response.json({ error: 'ai account unavailable' }, { status: 502 })
  }

  let upstream: Response | undefined
  for (let attempt = 0; attempt < COLD_START_RETRIES; attempt++) {
    upstream = await fetch(`${openWebUiUrl()}/ollama/api/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENWEBUI_CLASSIFY_MODEL ?? 'qwen3:1.7b',
        messages: [
          { role: 'system', content: buildClassifyPrompt(markets) },
          { role: 'user', content: body.transcript },
        ],
        stream: false,
        think: false,
        format: CLASSIFY_SCHEMA,
        // num_predict caps a constrained-decoding loop: at the server's ~8
        // tokens/s an unbounded repeat otherwise burns CPU for minutes.
        options: { temperature: 0, num_predict: 2048 },
        keep_alive: '24h',
      }),
    })
    // The first call after an Ollama restart loads the model; wait it out.
    if (upstream.status !== 503 && upstream.status !== 500) break
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
  }

  if (!upstream || !upstream.ok) {
    return Response.json(
      { error: `classification failed (${upstream?.status ?? 'no response'})` },
      { status: 502 },
    )
  }

  const reply = (await upstream.json()) as { message?: { content?: string } }
  const text = reply.message?.content
  if (!text) return Response.json({ error: 'empty classification' }, { status: 502 })

  let parsed
  try {
    parsed = classifyResponseSchema.parse(JSON.parse(text))
  } catch {
    return Response.json({ error: 'malformed classification' }, { status: 502 })
  }

  return Response.json({ items: postValidate(parsed, markets) })
}

export const Route = createFileRoute('/api/classify')({
  server: {
    handlers: {
      POST: ({ request }) => classify(request),
    },
  },
})
