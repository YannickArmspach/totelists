/**
 * The capture surface: one big round button, whichever way you want to add
 * something — say it, type it, or (soon) snap it. The corner arrow cycles
 * modes, so the thumb never has to leave the button, and every mode keeps the
 * same footprint so nothing under it jumps.
 *
 * All three modes converge on the same pipeline, so the status, transcript,
 * done and error panels below are shared.
 */
import { useState } from 'react'
import { Camera, ChevronRight, Keyboard, Loader2, Mic, Square } from 'lucide-react'

import { useRecorder } from '#/hooks/use-recorder'
import { useSayIt } from '#/hooks/use-say-it'
import type { ClassifyMarket } from '#/lib/classify/schema'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { cn } from '#/lib/utils'
import { m } from '#/paraglide/messages'

const MODES = ['say', 'type', 'snap'] as const
type Mode = (typeof MODES)[number]

const MODE_ICON: Record<Mode, typeof Mic> = { say: Mic, type: Keyboard, snap: Camera }
const MODE_LABEL: Record<Mode, () => string> = {
  say: () => m.say_it(),
  type: () => m.type_it(),
  snap: () => m.snap_it(),
}

export function AddIt({ toteId, markets }: { toteId: string; markets: ClassifyMarket[] }) {
  const { state, submitRecording, submitText, retry, reset } = useSayIt(toteId, markets)
  const recorder = useRecorder(submitRecording)
  const [mode, setMode] = useState<Mode>('say')
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')

  const busy = state.phase === 'transcribing' || state.phase === 'classifying'
  const recording = recorder.state === 'recording'
  const Icon = MODE_ICON[mode]

  const nextMode = () => {
    const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length]
    setMode(next)
    setTyping(next === 'type')
  }

  return (
    <section className="flex flex-col items-center gap-4">
      <div className="relative">
        <button
          type="button"
          disabled={busy || mode === 'snap'}
          onClick={() =>
            mode === 'say'
              ? recording
                ? recorder.stop()
                : void recorder.start()
              : setTyping((open) => !open)
          }
          className={cn(
            'grid size-40 place-items-center rounded-full text-primary-foreground shadow-lg transition-all focus-visible:outline-4 focus-visible:outline-ring disabled:opacity-70',
            recording ? 'animate-pulse bg-destructive' : 'bg-primary active:scale-95',
          )}
          aria-label={recording ? m.tap_to_stop() : MODE_LABEL[mode]()}
        >
          <span className="flex flex-col items-center gap-2">
            {busy ? (
              <Loader2 className="size-10 animate-spin" />
            ) : recording ? (
              <Square className="size-10" />
            ) : (
              <Icon className="size-10" />
            )}
            <span className="text-lg font-semibold">
              {recording ? `${recorder.elapsed}s` : MODE_LABEL[mode]()}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={nextMode}
          aria-label={m.add_it_next_mode()}
          className="absolute -bottom-1 -right-1 grid size-11 place-items-center rounded-full border bg-background text-muted-foreground shadow transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <p className="min-h-5 text-sm text-muted-foreground" aria-live="polite">
        {state.phase === 'transcribing' && m.transcribing()}
        {state.phase === 'classifying' && m.sorting()}
        {recording && m.tap_to_stop()}
        {mode === 'snap' && !busy && m.snap_soon()}
      </p>

      {state.phase === 'classifying' && (
        <Transcript label={m.heard()} text={state.transcript} />
      )}

      {state.phase === 'done' && (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="font-medium text-primary">
            {state.count === 1 ? m.one_item_bagged() : m.items_bagged({ count: state.count })}
          </p>
          <Button variant="secondary" size="sm" onClick={reset}>
            {MODE_LABEL[mode]()}
          </Button>
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

      {mode === 'type' && typing && (
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
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={m.quick_add_placeholder()}
            aria-label={m.quick_add_placeholder()}
          />
          <Button type="submit" variant="secondary" disabled={busy || !text.trim()}>
            {m.add()}
          </Button>
        </form>
      )}
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
