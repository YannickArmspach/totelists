# AI service — Open WebUI + Ollama

The voice loop's two AI steps are self-hosted and sit behind one gateway:

```
browser ──(blob / transcript + TrailBase JWT)──▶ apps/web server routes
    /api/transcribe ─▶ Open WebUI /api/v1/audio/transcriptions   (faster-whisper)
    /api/classify  ──▶ Open WebUI /ollama/api/chat ─▶ Ollama      (qwen3:1.7b)
```

- **Ollama** serves the triage model. It is never exposed: only Open WebUI
  reaches it, over the compose network.
- **Open WebUI** (v0.11.4, pinned) is the authenticated front: per-user API
  keys, built-in faster-whisper speech-to-text, usage attribution per user in
  its admin panel, and a RAG/knowledge workspace per account.
- The stack is `docker-compose.ai.yml` at the repo root, built from
  `services/ollama/` and `services/open-webui/` (Docker-only directories — no
  `package.json`, deliberately: the pnpm `services/*` workspace glob and the
  web Dockerfile's manifest stage must not see them).

Production: Temps project **`tote-ai`** (context `console-ynk-one`, id 13,
compose preset, `composePath: docker-compose.ai.yml`), routed at
**https://ai.tote.markets**. All secrets live in the local gitignored
`.env.production` and as env vars on the Temps projects.

## Linked accounts (one Open WebUI account per Tote user)

There is no shared API key. Each Tote user gets their own Open WebUI account,
provisioned lazily by `apps/web/src/lib/server/ai-account.ts` on their first
AI call:

1. The browser sends its TrailBase JWT (`Authorization: Bearer …`) to
   `/api/transcribe` and `/api/classify` (`use-say-it.ts` attaches
   `client.headers()`). No token → **401**.
2. The server validates the token against TrailBase
   (`GET /api/auth/v1/status` — note it answers 200 either way; a rejected
   token comes back as `{"auth_token": null}`), then reads `sub` (user id)
   and `email` from the JWT claims.
3. It looks the user up in the **`ai_accounts`** table. On a miss it creates
   the Open WebUI account with the admin key
   (`POST /api/v1/auths/add`, role `user`, random password), signs in as that
   user once (`POST /api/v1/auths/signin` — API keys are strictly
   self-service), mints the personal key (`POST /api/v1/auths/api_key` →
   `sk-…`), and stores the row.
4. Every upstream call is sent with the **user's own `sk-` key**, so the
   Open WebUI admin panel attributes usage to the right person.

`ai_accounts` (migration `U1790700000__ai_accounts.sql`) stores
`user_id` (UNIQUE, FK `_user`), `openwebui_user_id`, `openwebui_email`,
`openwebui_password` (kept for future UI access / key rotation) and
`api_key`. Its record API is locked by access rule to the service account
**`svc-ai@tote.markets`**: an ordinary authenticated browser gets an empty
list and 403 on read/write; only the web server, logged in as the service
account, can touch it. The service account is a normal TrailBase user that
must exist **and be verified** in each environment (no SMTP anywhere, so
verification is manual — prod admin UI at `https://api.tote.markets/_/admin`,
dev via the sqlite `unverified_email → email` promotion).

Open WebUI's first signup becomes admin and signup then disables itself; the
admin account and its API key are in `.env.production`.

## API surface used

| Call | Endpoint | Auth |
|---|---|---|
| Transcription | `POST {OPENWEBUI_URL}/api/v1/audio/transcriptions` — multipart `file` (+ optional `language`) → `{ text }` | user `sk-` key |
| Triage | `POST {OPENWEBUI_URL}/ollama/api/chat` — Ollama-native body | user `sk-` key |
| Create user | `POST /api/v1/auths/add` | admin `sk-` key |
| Sign in / mint key | `POST /api/v1/auths/signin`, `POST /api/v1/auths/api_key` | password / user JWT |

The triage call is Ollama-native on purpose — the `/ollama/*` proxy forwards
unknown fields verbatim, which the route depends on:

```jsonc
{
  "model": "qwen3:1.7b",          // MODEL_CLASSIFY
  "messages": [ { "role": "system", "content": "<buildClassifyPrompt(markets)>" },
                { "role": "user",   "content": "<transcript>" } ],
  "stream": false,
  "think": false,                  // qwen3 is a thinking model; latency killer if on
  "format": { /* CLASSIFY_SCHEMA — constrained decoding, reply IS the JSON */ },
  "options": { "temperature": 0, "num_predict": 2048 },  // cap: constrained decoding can loop
  "keep_alive": "24h"
}
```

The reply is `{ message: { content } }`; the route then runs the usual
`classifyResponseSchema` (zod) + `postValidate()` grounding. Both routes retry
3×2 s on 500/503 (cold start: the first call after a restart loads the model).

## Configuration

### Web app (server-only env, never `VITE_`)

| Var | Default | Role |
|---|---|---|
| `OPENWEBUI_URL` | `https://ai.tote.markets` | gateway origin |
| `OPENWEBUI_ADMIN_API_KEY` | — | admin key, used only to provision accounts |
| `MODEL_CLASSIFY` | `qwen3:1.7b` | triage model |
| `TRAILBASE_INTERNAL_URL` | `http://localhost:4100` | server→TrailBase (dev trail; **4000 is Caddy, TLS-only, Node rejects it**). Compose: `http://trailbase:4000`; prod: `https://api.tote.markets` |
| `TOTE_SVC_EMAIL` / `TOTE_SVC_PASSWORD` | — | TrailBase service account |
| `FAKE_AI` | — | `1` = canned transcribe/classify, no stack needed |

Heads-up: in `pnpm dev` the `.env` is loaded into `process.env` **once at
boot** — restart `pnpm dev` after editing it.

### AI stack (`docker-compose.ai.yml`)

| Var | Default | Role |
|---|---|---|
| `MODEL_CLASSIFY` | `qwen3:1.7b` | the model Ollama pulls at boot (and the one the app asks for — set the same value on both sides) |
| `MODEL_TRANSCRIBE` | `small` | faster-whisper model (int8, CPU); also a build arg that pre-bakes it into the image |
| `OPENWEBUI_SECRET_KEY` | *(empty → key persisted in the volume)* | JWT signing key (`WEBUI_SECRET_KEY`). Never use a `:?` guard: the platform's compose pull phase interpolates **before** secrets are injected |
| `OPENWEBUI_PUBLIC_URL` | `http://localhost:5100` | `WEBUI_URL` |
| `OLLAMA_CONTEXT_LENGTH` | `8192` | lower to 4096 if RAM is tight |

Baked-in flags worth knowing: `ENABLE_API_KEYS` (plural — the v0.11.4 name) +
`USER_PERMISSIONS_FEATURES_API_KEYS` (non-admins may mint their own key),
`BYPASS_MODEL_ACCESS_CONTROL` (without it non-admin API users get *"Model not
found"*), `USER_PERMISSIONS_WORKSPACE_KNOWLEDGE_ACCESS` (per-user RAG),
title/tags/follow-up/search generation all off. Do **not** set `OFFLINE_MODE`
(it would block the whisper fallback download) and don't flip these in the
admin UI — UI values are config-table-backed and override the env on later
boots.

Ports: Open WebUI publishes `127.0.0.1:5100` (the deploy host's loopback is
shared across stacks: web 3100, api 4100, ai 5100). Volumes: `ollama`
(models) and `open-webui` (DB, whisper cache — the `small` model is pre-baked
into the image so the first transcription doesn't download 460 MB).

## How to change whisper and qwen ?

Two env vars, nothing else:

```sh
MODEL_CLASSIFY=qwen3:1.7b   # triage (Ollama) — set on tote-ai AND tote-web
MODEL_TRANSCRIBE=small      # speech-to-text (faster-whisper) — set on tote-ai
```

Change the value(s), redeploy the project(s) that carry them, done. Locally:
same vars in `.env` (one file feeds both the stack and the app), restart.

Local A/B testing: pull extra candidates into the volume once
(`docker exec tote_ai-ollama-1 ollama pull gemma3:4b`), then flip
`MODEL_CLASSIFY` and restart — warm volumes never re-download, so switching
between e.g. `qwen3:4b` and `gemma3:4b` is instant.

### Triage model (Ollama) — the possibilities

| Model (Ollama tag) | Disk / resident RAM | Classification¹ | French | CPU speed | Notes |
|---|---|---|---|---|---|
| `qwen3:0.6b` | 0.5 / ~1 GB | 89.2 % | weak | fastest | emergency fallback only |
| `qwen3:1.7b` | 1.4 / ~2.3 GB | 91.3 % | good | fast | loses quantities, occasional wrong department |
| `llama3.2:3b` | 2.0 / ~2.8 GB | 92.1 % | weaker than qwen/gemma | fast | not a thinking model |
| `gemma3:4b` | 3.3 / ~3.5 GB | 92.8 % | excellent | medium | best multilingual at this size; not a thinking model |
| `qwen3:4b` **(current)** | 2.6 / ~3.5 GB | 93.7 % | very good | medium | the default |
| `qwen3:8b` | 5.2 / ~6 GB | 95.1 % | very good | slow on this CPU | needs the env memory limit raised to ≥ 8 GB |

¹ small-model classification benchmark scores, indicative only.

Any Ollama model works — the route sends `think: false` (needed by the qwen3
family, ignored by the others) and native `format` constrained decoding, which
every Ollama model supports.

**Procedure:** set `MODEL_CLASSIFY=<tag>` on **both** `tote-ai` (drives what
Ollama pulls at boot — idempotent, warm volumes never re-download) and
`tote-web` (what the app asks for), redeploy both. Mind the RAM column: the
env memory limit (`temps environments resources production -p tote-ai
--memory …`) must fit the resident size, or the load dies with
`signal: killed`; ≥ `qwen3:8b` means raising it. Old weights stay in the
`ollama` volume (disk, not RAM — `OLLAMA_MAX_LOADED_MODELS=1`).

### Whisper model (faster-whisper) — the possibilities

| `MODEL_TRANSCRIBE` | RAM (int8) | French accuracy | CPU speed (short memo) | Notes |
|---|---|---|---|---|
| `tiny` | ~150 MB | poor | ~2 s | product names mangled; avoid |
| `base` | ~250 MB | mediocre | ~4 s | RAM-squeeze fallback |
| `small` | ~600 MB | decent | ~9 s | the light option |
| `medium` | ~1.5 GB | good | ~25 s | dominated by turbo — skip |
| `large-v3-turbo` **(current)** | ~1.6 GB | very good | ~15 s | the default — best French/speed trade-off |
| `large-v3` | ~3 GB | best | ~60 s+ | only worth it with a GPU |

Multilingual quality ranking for French:
`large-v3 > large-v3-turbo ≫ small > base > tiny`.

**Procedure:** set `MODEL_TRANSCRIBE=<name>` on `tote-ai` and redeploy
(locally: `.env` + restart the stack). The same var is a build arg that
pre-bakes the model into the image, so the rebuild ships it and the first
transcription never blocks on a download.

### Reference latencies (prod CPU, ~8 tok/s)

With `qwen3:1.7b` + whisper `small`, measured: classify ≈ 3 s warm, ≈ 12 s
after a restart (model load); transcription ≈ 9 s for a short memo. The
current `qwen3:4b` + `large-v3-turbo` run roughly 2× slower per the tables
above. `keep_alive: "24h"` + `OLLAMA_KEEP_ALIVE=-1` keep the triage model
resident.

## Running it

**Local**: `docker compose -f docker-compose.ai.yml up --build` (models land
in the volumes on first boot), then bootstrap once against
`http://localhost:5100`: first `POST /api/v1/auths/signup` = admin → `POST
/api/v1/auths/api_key` → put the key in `apps/web/.env`
(`OPENWEBUI_ADMIN_API_KEY`). Create + verify `svc-ai@tote.markets` in the dev
trail (register via API, then promote `unverified_email → email` in
`services/trailbase/traildepot/data/main.db` with a python-sqlite session
that defines `is_email()`). Or skip all of it with `FAKE_AI=1`.

**Prod (Temps, context `console-ynk-one`)**: push to `main` does **not**
auto-deploy — `bunx @temps-sdk/cli@0.1.36 --target-context console-ynk-one
deploy -p tote-ai -e production -b main -y` (same for `tote-web`,
`tote-api`). Platform traps already hit once, so you don't have to:

- `domains add` only provisions TLS; the domain→project binding is a separate
  call (`POST /projects/13/custom-domains {"domain": …, "environment_id": …}`)
  — without it the domain serves the Temps console SPA.
- Certs stuck `pending_http` → `domains orders finalize --domain-id N`.
- `composePath` has no CLI flag → `POST /projects/<id>/settings
  {"preset_config": {"composePath": "docker-compose.ai.yml"}}`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `/api/*` → 401 | Missing/expired TrailBase JWT, or the web server can't reach `TRAILBASE_INTERNAL_URL` (dev: stale `.env` in a running `pnpm dev`; 4000 vs 4100) |
| `/api/*` → 502 "ai account unavailable" | `svc-ai` not verified / wrong `TOTE_SVC_PASSWORD`, or `OPENWEBUI_ADMIN_API_KEY` missing |
| `"Model not found"` from `/ollama/api/chat` | model not pulled, or `BYPASS_MODEL_ACCESS_CONTROL` lost |
| `"llama-server process has terminated: signal: killed"` | OOM — raise the env memory limit |
| 400 `FILE_NOT_SUPPORTED` on transcription | upload content-type not `audio/*` — escape hatch: `AUDIO_STT_SUPPORTED_CONTENT_TYPES=audio/*,video/webm` |
| classify burns CPU for minutes | constrained-decoding loop — `num_predict` caps it; check `runtime-logs -p tote-ai` for `n_gen` climbing |

Secrets inventory (all mirrored in `.env.production`): Open WebUI admin
email/password + admin `sk-` key, `OPENWEBUI_SECRET_KEY`, `TOTE_SVC_PASSWORD`.
Temps `--secret` vars are one-way — losing the local copy means rotating.
Rotating `OPENWEBUI_SECRET_KEY` is safe: users' `sk-` keys are DB-backed,
only UI sessions are invalidated.
