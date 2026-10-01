/**
 * The say-it pipeline: blob → /api/transcribe → /api/classify → rows.
 *
 * Kept as an explicit state machine so the button can narrate each stage, and
 * so a classify failure keeps the transcript — retrying must not require
 * saying it all again.
 *
 * Classified items land as status 'new' (the inbox). A proposed department is
 * created right here, on the speaking user's own token, deduped per market —
 * and its id is reused for every item the batch routed there.
 */
import { useCallback, useState } from 'react'

import { departmentsCollection, itemsCollection } from '#/db/collections'
import { attachDepartment } from '#/lib/catalog'
import { client, currentUserId } from '#/lib/auth'
import { newId } from '#/db/ids'
import { getLocale } from '#/paraglide/runtime'
import type { ClassifyMarket, ParsedItem } from '#/lib/classify/schema'

export type SayItPhase =
  | { phase: 'idle' }
  | { phase: 'transcribing' }
  | { phase: 'classifying'; transcript: string }
  | { phase: 'done'; transcript: string; count: number }
  | { phase: 'error'; stage: 'transcribe' | 'classify'; transcript?: string }

async function classifyAndInsert(
  transcript: string,
  toteId: string,
  markets: ClassifyMarket[],
): Promise<number> {
  // The TrailBase token identifies the speaker: the AI routes bill the call to
  // their personal Open WebUI account and reject anonymous requests.
  const response = await fetch('/api/classify', {
    method: 'POST',
    headers: { ...client.headers(), 'content-type': 'application/json' },
    body: JSON.stringify({ transcript, markets }),
  })
  if (!response.ok) throw new Error(`classify ${response.status}`)
  const { items } = (await response.json()) as { items: ParsedItem[] }

  const userId = currentUserId() ?? null
  const now = Math.floor(Date.now() / 1000)

  /*
    One department per proposed (market, name), however many items point at it.
    A proposal is about one store, so it lands as CUSTOM to that market rather
    than as a shared preset — the user promotes it deliberately if they want it
    everywhere. Creating and attaching in the same tick is safe because
    market_departments' CREATE rule validates only the market.
  */
  const created = new Map<string, string>()
  for (const item of items) {
    if (!item.market_id || !item.new_department_name) continue
    const key = `${item.market_id}:${item.new_department_name.toLowerCase()}`
    if (created.has(key)) continue
    const id = newId()
    created.set(key, id)
    departmentsCollection.insert({
      id,
      created_by: userId,
      name: item.new_department_name,
      classification_hint: item.new_department_hint ?? '',
      owner_market_id: item.market_id,
      auto_created: 1,
    })
    attachDepartment(item.market_id, id, 999) // Last; the user reorders if they care.
  }

  let sort = now
  for (const item of items) {
    const departmentId =
      item.department_id ??
      (item.market_id && item.new_department_name
        ? (created.get(`${item.market_id}:${item.new_department_name.toLowerCase()}`) ?? null)
        : null)
    itemsCollection.insert({
      id: newId(),
      tote_id: toteId,
      created_by: userId,
      market_id: item.market_id,
      department_id: departmentId,
      title: item.title,
      number: item.number,
      unit: item.unit,
      description: item.description,
      price_cents: item.price_cents,
      status: 'new',
      bought_at: null,
      bought_by: null,
      sort: sort++,
    })
  }
  return items.length
}

export function useSayIt(toteId: string | null, markets: ClassifyMarket[]) {
  const [state, setState] = useState<SayItPhase>({ phase: 'idle' })

  const runClassify = useCallback(
    async (transcript: string) => {
      if (!toteId) return
      setState({ phase: 'classifying', transcript })
      try {
        const count = await classifyAndInsert(transcript, toteId, markets)
        setState({ phase: 'done', transcript, count })
      } catch {
        setState({ phase: 'error', stage: 'classify', transcript })
      }
    },
    [toteId, markets],
  )

  const submitRecording = useCallback(
    async (blob: Blob) => {
      setState({ phase: 'transcribing' })
      try {
        const form = new FormData()
        form.append('audio', blob)
        /*
          Pin the transcription to the interface language. Whisper otherwise
          detects it from the audio, which is reliable on a full sentence but
          thin on what this app actually records — a three-word list ("lait,
          pain, œufs"), often in a noisy aisle. The locale is the stronger
          prior: someone running the app in French is speaking French.

          The trade-off is real, though: forced, a mismatched language makes
          Whisper TRANSLATE rather than fall back to detection ("deux kilos de
          tomates" under `en` comes back as "2 kg of tomato"). So this is only
          right while the locale genuinely tracks the spoken language.

          Paraglide's codes are ISO-639-1, which is what Whisper wants.
        */
        form.append('language', getLocale())
        const response = await fetch('/api/transcribe', {
          method: 'POST',
          headers: client.headers(),
          body: form,
        })
        if (!response.ok) throw new Error(`transcribe ${response.status}`)
        const { text } = (await response.json()) as { text: string }
        if (!text.trim()) throw new Error('empty transcript')
        await runClassify(text)
      } catch {
        setState((previous) =>
          previous.phase === 'classifying' || previous.phase === 'error'
            ? previous
            : { phase: 'error', stage: 'transcribe' },
        )
      }
    },
    [runClassify],
  )

  /** The typed quick-add: same pipeline, minus the microphone. */
  const submitText = useCallback((text: string) => runClassify(text), [runClassify])

  const retry = useCallback(() => {
    setState((previous) => {
      if (previous.phase === 'error' && previous.transcript) {
        void runClassify(previous.transcript)
        return { phase: 'classifying', transcript: previous.transcript }
      }
      return { phase: 'idle' }
    })
  }, [runClassify])

  const reset = useCallback(() => setState({ phase: 'idle' }), [])

  return { state, submitRecording, submitText, retry, reset }
}
