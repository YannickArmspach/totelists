/**
 * Whisper routes decoding on the uploaded FILENAME's extension, so the name we
 * put on the multipart part has to match what the browser actually recorded —
 * Chrome says audio/webm, Safari says audio/mp4, and a wrong suffix is a 400.
 */
const EXTENSIONS: Array<[string, string]> = [
  ['audio/webm', 'webm'],
  ['audio/mp4', 'mp4'],
  ['audio/mpeg', 'mp3'],
  ['audio/ogg', 'ogg'],
  ['audio/wav', 'wav'],
  ['audio/flac', 'flac'],
]

export function filenameForMime(mime: string | undefined): string {
  const base = (mime ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  const match = EXTENSIONS.find(([prefix]) => base === prefix)
  return `recording.${match?.[1] ?? 'bin'}`
}
