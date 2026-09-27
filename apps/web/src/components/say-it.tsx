/**
 * The big button, and the whole voice loop's UI states around it.
 */
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Loader2, Mic, Square } from 'lucide-react'

import { useRecorder } from '#/hooks/use-recorder'
import { useSayIt } from '#/hooks/use-say-it'
import type { ClassifyMarket } from '#/lib/classify/schema'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { cn } from '#/lib/utils'
import { m } from '#/paraglide/messages'

export function SayIt({ toteId, markets }: { toteId: string; markets: ClassifyMarket[] }) {
  const { state, submitRecording, submitText, retry, reset } = useSayIt(toteId, markets)
  const recorder = useRecorder(submitRecording)
  const [text, setText] = useState('')

  const busy = state.phase === 'transcribing' || state.phase === 'classifying'
  const recording = recorder.state === 'recording'

  return (
    <section className="flex flex-col items-center gap-4">
      <button
        type="button"
        disabled={busy}
        onClick={() => (recording ? recorder.stop() : void recorder.start())}
        className={cn(
          'grid size-40 place-items-center rounded-full text-primary-foreground shadow-lg transition-all focus-visible:outline-4 focus-visible:outline-ring disabled:opacity-70',
          recording ? 'animate-pulse bg-destructive' : 'bg-primary active:scale-95',
        )}
        aria-label={recording ? m.tap_to_stop() : m.say_it()}
      >
        <span className="flex flex-col items-center gap-2">
          {busy ? (
            <Loader2 className="size-10 animate-spin" />
          ) : recording ? (
            <Square className="size-10" />
          ) : (
            <Mic className="size-10" />
          )}
          <span className="text-lg font-semibold">
            {recording ? `${recorder.elapsed}s` : m.say_it()}
          </span>
        </span>
      </button>

      <p className="min-h-5 text-sm text-muted-foreground" aria-live="polite">
        {state.phase === 'transcribing' && m.transcribing()}
        {state.phase === 'classifying' && m.sorting()}
        {recording && m.tap_to_stop()}
      </p>

      {state.phase === 'classifying' && (
        <Transcript label={m.heard()} text={state.transcript} />
      )}

      {state.phase === 'done' && (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="font-medium text-primary">
            {state.count === 1 ? m.one_item_bagged() : m.items_bagged({ count: state.count })}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={reset}>
              {m.say_it()}
            </Button>
            <Link
              to="/inbox"
              className="inline-flex min-h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              {m.inbox_title()} →
            </Link>
          </div>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-destructive">
            {state.stage === 'transcribe' ? m.error_transcribe() : m.error_classify()}
          </p>
          {state.transcript && <Transcript label={m.heard()} text={state.transcript} />}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={reset}>
              {m.cancel()}
            </Button>
            <Button size="sm" onClick={retry}>
              {m.retry()}
            </Button>
          </div>
        </div>
      )}

      <form
        className="flex w-full max-w-sm gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const trimmed = text.trim()
          if (!trimmed || busy) return
          setText('')
          void submitText(trimmed)
        }}
      >
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={m.quick_add_placeholder()}
          aria-label={m.quick_add_placeholder()}
        />
        <Button type="submit" variant="secondary" disabled={busy || !text.trim()}>
          {m.add()}
        </Button>
      </form>
    </section>
  )
}

function Transcript({ label, text }: { label: string; text: string }) {
  return (
    <p className="max-w-sm text-center text-sm text-muted-foreground">
      <span className="font-medium">{label}</span> “{text}”
    </p>
  )
}
