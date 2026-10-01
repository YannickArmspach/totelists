/**
 * One Open WebUI account per Tote user, provisioned lazily.
 *
 * The AI routes need two identities to meet: the caller's (a TrailBase JWT the
 * browser now sends in `Authorization`) and the server's own (a TrailBase
 * service account that is the only identity allowed through the `ai_accounts`
 * record API — browsers get 403 on every row, see config.textproto).
 *
 * On a user's first AI call the server creates their Open WebUI account with
 * the admin API key, signs in as them once to mint their personal `sk-` key
 * (Open WebUI keys are strictly self-service), and stores the lot in
 * `ai_accounts`. Every later call reuses the stored key, so Open WebUI
 * attributes usage to the right user and each user gets their own workspace.
 */
import { initClient, FetchError, type Client } from 'trailbase'

// Default matches `pnpm dev`: the dev TrailBase listens on 4100 in plain HTTP
// (Caddy owns 4000 and only speaks TLS, which Node's fetch won't trust).
const TRAILBASE_INTERNAL_URL = process.env.TRAILBASE_INTERNAL_URL ?? 'http://localhost:4100'

export function openWebUiUrl(): string {
  return process.env.OPENWEBUI_URL ?? 'https://ai.tote.markets'
}

export interface Caller {
  userId: string
  email: string | null
}

interface AiAccountRow {
  user_id: string
  openwebui_user_id: string
  openwebui_email: string
  openwebui_password: string
  api_key: string
}

/**
 * Identify the caller from the `Authorization: Bearer <TrailBase JWT>` header.
 *
 * The signature check is delegated to TrailBase itself (`/api/auth/v1/status`
 * with the caller's token): this server holds no verification key, and a
 * round-trip per AI call is noise next to the inference it fronts. Claims are
 * only decoded after TrailBase has accepted the token.
 */
export async function verifyCaller(request: Request): Promise<Caller | null> {
  const header = request.headers.get('authorization')
  const token = header?.match(/^Bearer (.+)$/)?.[1]
  if (!token) return null

  const claims = decodeClaims(token)
  if (!claims?.sub) return null
  if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) return null

  const response = await fetch(`${TRAILBASE_INTERNAL_URL}/api/auth/v1/status`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return null
  // /status answers 200 either way; a rejected token comes back as
  // `{"auth_token": null}` (verified against TrailBase 0.33.20).
  const body = (await response.json()) as { auth_token?: string | null }
  if (!body.auth_token) return null

  return { userId: claims.sub, email: typeof claims.email === 'string' ? claims.email : null }
}

function decodeClaims(jwt: string): { sub?: string; email?: unknown; exp?: unknown } | null {
  const payload = jwt.split('.')[1]
  if (!payload) return null
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

/** The caller's personal Open WebUI API key, provisioning it first if needed. */
export async function getOrProvisionApiKey(caller: Caller): Promise<string> {
  const existing = await findAccount(caller.userId)
  if (existing) return existing.api_key

  const account = await provision(caller)
  try {
    await asService((svc) => svc.records<AiAccountRow>('ai_accounts').create(account))
  } catch (err) {
    // Two first calls raced: UNIQUE(user_id) kept one row; use whichever won.
    const winner = await findAccount(caller.userId)
    if (winner) return winner.api_key
    throw err
  }
  return account.api_key
}

async function findAccount(userId: string): Promise<AiAccountRow | undefined> {
  const response = await asService((svc) =>
    svc.records<AiAccountRow>('ai_accounts').list({
      filters: [{ column: 'user_id', value: userId }],
      pagination: { limit: 1 },
    }),
  )
  return response.records[0]
}

/** Create the Open WebUI user and mint their API key. */
async function provision(caller: Caller): Promise<AiAccountRow> {
  const adminKey = process.env.OPENWEBUI_ADMIN_API_KEY
  if (!adminKey) throw new Error('OPENWEBUI_ADMIN_API_KEY is not set')
  const base = openWebUiUrl()

  // Open WebUI never emails anyone, so a synthetic address is fine when the
  // TrailBase token carries no email claim.
  const email = (caller.email ?? `user-${caller.userId}@tote.local`).toLowerCase()
  const password = crypto.randomUUID() + crypto.randomUUID()

  const added = await openWebUi<{ id: string }>(`${base}/api/v1/auths/add`, adminKey, {
    name: email.split('@')[0],
    email,
    password,
    role: 'user',
  })

  const signin = await openWebUi<{ token: string }>(`${base}/api/v1/auths/signin`, null, {
    email,
    password,
  })

  const minted = await openWebUi<{ api_key: string }>(
    `${base}/api/v1/auths/api_key`,
    signin.token,
    {},
  )
  if (!minted.api_key) throw new Error('Open WebUI returned no api_key')

  return {
    user_id: caller.userId,
    openwebui_user_id: added.id,
    openwebui_email: email,
    openwebui_password: password,
    api_key: minted.api_key,
  }
}

async function openWebUi<T>(url: string, bearer: string | null, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`Open WebUI ${new URL(url).pathname} failed (${response.status})`)
  }
  return (await response.json()) as T
}

/*
  The service client lives for the process. Its auth token expires hourly and
  the trailbase client does not re-login by itself, so every operation retries
  once through a fresh login on 401.
*/
let service: Client | undefined

async function asService<T>(operation: (svc: Client) => Promise<T>): Promise<T> {
  if (!service) service = await loginService()
  try {
    return await operation(service)
  } catch (err) {
    if (err instanceof FetchError && err.status === 401) {
      service = await loginService()
      return await operation(service)
    }
    throw err
  }
}

async function loginService(): Promise<Client> {
  const email = process.env.TOTE_SVC_EMAIL
  const password = process.env.TOTE_SVC_PASSWORD
  if (!email || !password) throw new Error('TOTE_SVC_EMAIL / TOTE_SVC_PASSWORD are not set')
  const svc = initClient(TRAILBASE_INTERNAL_URL)
  await svc.login(email, password)
  return svc
}
