/**
 * Signing in, and staying signed in.
 *
 * The sign-in screens are the app's own, at `/login` and `/register` — email
 * and password go straight to the TrailBase API, no cookie, no redirect. The
 * client library does not persist tokens (it says so), so that job is ours,
 * including clearing them on the way out.
 *
 * `/auth/callback` + `completeLogin` are the PKCE half of an OAuth flow. No
 * provider is configured yet; the plumbing stays because the redirect URI is
 * already on the backend's allowlist.
 */

import { initClient, type Tokens, type User } from 'trailbase'
import { useSyncExternalStore } from 'react'
import { m } from '#/paraglide/messages'

export const TRAILBASE_URL =
  (import.meta.env.VITE_TRAILBASE_URL as string | undefined) ?? 'http://localhost:4000'

const TOKENS_KEY = 'tote:auth:v1'
const VERIFIER_KEY = 'tote:auth:pkce'
export const CALLBACK_PATH = '/auth/callback'

function storage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null // Private mode, or storage disabled.
  }
}

function readTokens(): Tokens | undefined {
  const raw = storage()?.getItem(TOKENS_KEY)
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as Tokens
  } catch {
    return undefined
  }
}

function writeTokens(tokens: Tokens | undefined): void {
  const store = storage()
  if (!store) return
  try {
    if (tokens) store.setItem(TOKENS_KEY, JSON.stringify(tokens))
    else store.removeItem(TOKENS_KEY)
  } catch {
    // Nothing to do: the session simply won't outlive the tab.
  }
}

/**
 * Whether a session is on disk.
 *
 * Read synchronously at startup — the `_authed` layout redirects to `/login`
 * on it before the collections try to sync anything.
 */
export function hasStoredSession(): boolean {
  return readTokens() !== undefined
}

let currentUser: User | undefined
const listeners = new Set<() => void>()

function publish(user: User | undefined): void {
  currentUser = user
  for (const listener of listeners) listener()
}

export const client = initClient(TRAILBASE_URL, {
  tokens: readTokens(),
  // Fires on sign-in, sign-out and every silent refresh, so this is the one
  // place that has to know how tokens are stored.
  onAuthChange: (c, user) => {
    writeTokens(c.tokens())
    publish(user)
  },
})

currentUser = client.user()

/**
 * The signed-in user's id, or undefined.
 *
 * Read outside React by the write path: every row carries its author, and the
 * access rules reject a create where it doesn't match the caller.
 */
export function currentUserId(): string | undefined {
  return currentUser?.id
}

export function useUser(): User | undefined {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => currentUser,
    () => undefined, // The server knows no user; the first client paint corrects it.
  )
}

/** What went wrong, in words the sign-in screens can show as they are. */
export class AuthError extends Error {}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  try {
    const mfa = await client.login(email, password)
    // Nobody has a second factor yet; say so rather than appear to succeed.
    if (mfa) throw new AuthError(m.error_login_mfa())
  } catch (err) {
    if (err instanceof AuthError) throw err
    /*
      401 covers both a wrong password and an account whose email has never
      been confirmed, and the backend does not distinguish them — deliberately.
      Name both possibilities instead of guessing.
    */
    throw new AuthError(status(err) === 401 ? m.error_login_invalid() : m.error_login_failed())
  }
}

/**
 * Create an account.
 *
 * The backend sends a confirmation email and refuses to sign the account in
 * until the link is followed, so this cannot hand back a session.
 */
export async function signUp(email: string, password: string): Promise<void> {
  try {
    await client.register({ email, password, passwordRepeat: password })
  } catch (err) {
    throw new AuthError(
      status(err) === 409 ? m.error_register_exists() : m.error_register_failed(),
    )
  }
}

function status(err: unknown): number | undefined {
  return typeof err === 'object' && err && 'status' in err && typeof err.status === 'number'
    ? err.status
    : undefined
}

/** Trade the code an OAuth provider sent back for a session. */
export async function completeLogin(code: string): Promise<void> {
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
  if (!verifier) throw new Error(m.error_login_expired())

  const response = await fetch(`${TRAILBASE_URL}/api/auth/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorization_code: code, pkce_code_verifier: verifier }),
  })
  if (!response.ok) throw new Error(m.error_login_failed())

  writeTokens((await response.json()) as Tokens)
}

export async function logout(): Promise<void> {
  try {
    await client.logout()
  } finally {
    // Even if the server call fails, the local session must not survive it.
    writeTokens(undefined)
    publish(undefined)
    window.location.replace('/login')
  }
}
