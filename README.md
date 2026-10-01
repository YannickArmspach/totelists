# Tote

*Say it, we bag it.*

Voice-first shared shopping lists. Speak a shopping note, Whisper transcribes
it, a local LLM splits it into items and routes each one to the right market
and department. Lists sync live between members of a **tote** (a shared
shopping space — private with an invite link, or public and joinable by
anyone).

## Stack

- **apps/web** — React 19 + TanStack Start (SSR), Tailwind v4, TanStack DB
  collections over TrailBase record APIs (live subscriptions), Paraglide i18n
  (EN/FR), installable PWA.
- **services/trailbase** — [TrailBase](https://trailbase.io) (SQLite): auth,
  record APIs with row-level access rules, realtime subscriptions.
- **services/ollama** + **services/open-webui** — the self-hosted AI stack
  (`docker-compose.ai.yml`): Open WebUI fronts Ollama (`MODEL_CLASSIFY` triage)
  and built-in faster-whisper (speech-to-text). The web app's server routes
  proxy both and provision one Open WebUI account per Tote user (key stored in
  the `ai_accounts` table, server-only), so usage is attributed per user.
  Full picture — accounts, API, config, model swaps: [docs/service-ai.md](docs/service-ai.md).

## Development

```sh
pnpm install
brew install caddy && caddy trust           # local HTTPS, once — see below
cp apps/web/.env.example apps/web/.env   # set the OPENWEBUI_/TOTE_SVC_ values, or FAKE_AI=1
pnpm dev
```

`dev.js` starts TrailBase (`trail` binary, install: `curl -sSL
https://trailbase.io/install.sh | bash`), the Vite dev server, Caddy, and the
local AI stack (Open WebUI + Ollama via Docker, stopped again on Ctrl-C —
skip it with `pnpm dev --no-ai` + `FAKE_AI=1`), and prints the admin
credentials banner. App on https://localhost:3000, TrailBase admin on
https://localhost:4000/_/admin/, Open WebUI on https://localhost:5001.

**Why dev is HTTPS.** The app holds one permanent SSE stream per collection —
seven — against the TrailBase origin. HTTP/1.1 browsers allow six connections
per origin, so the seventh never connects: one collection silently stops
syncing and writes queue behind a saturated pool. HTTP/2 multiplexes them all
over a single connection, and browsers only negotiate it over TLS. So Caddy
terminates TLS on 3000/4000 and forwards to Vite (3100) and TrailBase (4100);
see `Caddyfile`. `caddy trust` installs Caddy's local CA into the system
keychain so the browser accepts the certificates — run it once, undo with
`caddy untrust`.

**First registration:** TrailBase requires email verification and dev has no
SMTP. Verify the user from the admin UI (Users → verify), then log in.

`FAKE_AI=1` in `apps/web/.env` runs the whole voice loop offline with canned
transcription/classification — no external keys needed.

## Docker

```sh
cp .env.example .env    # fill in the keys
docker compose up --build
```

Web on http://localhost:3000, TrailBase on http://localhost:4000 (depot on a
named volume; config + migrations re-seeded from the image on every start).

## Tests

```sh
pnpm test        # vitest
pnpm typecheck
```
