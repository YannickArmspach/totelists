/**
 * MediaRecorder, tamed: ask for the mic on start, hand back one Blob on stop,
 * release the tracks either way.
 *
 * The mime type is negotiated — Chrome speaks webm/opus, Safari only mp4 — and
 * travels with the blob so the upload can name the file correctly (Whisper
 * routes decoding on the extension).
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
const MAX_SECONDS = 60

export type RecorderState = 'idle' | 'recording'

export function useRecorder(onRecorded: (blob: Blob) => void) {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const discardRef = useRef(false)

  const start = useCallback(async () => {
    if (recorderRef.current) return
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mimeType = MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate))
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const chunks: Blob[] = []

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      for (const track of stream.getTracks()) track.stop()
      recorderRef.current = null
      setState('idle')
      if (!discardRef.current && chunks.length > 0) {
        onRecorded(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }))
      }
    }

    discardRef.current = false
    recorderRef.current = recorder
    recorder.start()
    setState('recording')
    setElapsed(0)
  }, [onRecorded])

  const stop = useCallback(() => {
    recorderRef.current?.stop()
  }, [])

  const cancel = useCallback(() => {
    discardRef.current = true
    recorderRef.current?.stop()
  }, [])

  // Tick the elapsed counter and enforce the cap while recording.
  useEffect(() => {
    if (state !== 'recording') return
    const startedAt = Date.now()
    const interval = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000)
      setElapsed(seconds)
      if (seconds >= MAX_SECONDS) recorderRef.current?.stop()
    }, 500)
    return () => clearInterval(interval)
  }, [state])

  // Unmounting mid-recording must not leave the mic on.
  useEffect(
    () => () => {
      discardRef.current = true
      recorderRef.current?.stop()
    },
    [],
  )

  return { state, elapsed, start, stop, cancel }
}
