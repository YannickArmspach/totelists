/**
 * One Meridian call per transcript: split the note into items and route each
 * to a market/department of the active tote.
 *
 * Meridian specifics that are easy to get wrong (see the plan):
 * - `x-meridian-agent: passthrough`, or an unrecognized client is given the
 *   default agent adapter and ~28 KB of coding-assistant system prompt.
 * - `x-meridian-source: fork-<uuid>` per request, or concurrent calls with
 *   similar openings collide on one session fingerprint.
 * - `output_config.format` (structured output) cannot be combined with tools;
 *   the reply's single text block IS the validated JSON.
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

const MODEL = 'claude-haiku-4-5'

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

  const apiKey = process.env.MERIDIAN_API_KEY
  if (!apiKey) return Response.json({ error: 'MERIDIAN_API_KEY is not set' }, { status: 500 })
  const baseUrl = process.env.MERIDIAN_URL ?? 'https://meridian.dev.ynk.one'

  const upstream = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'x-meridian-agent': 'passthrough',
      'x-meridian-source': `fork-${crypto.randomUUID()}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: buildClassifyPrompt(markets),
      messages: [{ role: 'user', content: body.transcript }],
      output_config: { format: { type: 'json_schema', schema: CLASSIFY_SCHEMA } },
    }),
  })

  if (!upstream.ok) {
    return Response.json({ error: `classification failed (${upstream.status})` }, { status: 502 })
  }

  const message = (await upstream.json()) as { content?: Array<{ type: string; text?: string }> }
  const text = message.content?.find((block) => block.type === 'text')?.text
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
