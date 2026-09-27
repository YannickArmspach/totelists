# Tote

*Say it, we bag it.*

Voice-first shared shopping lists. Speak a shopping note, Whisper transcribes
it, Claude splits it into items and routes each one to the right market and
department. Lists sync live between members of a **tote** (a shared shopping
space — private with an invite link, or public and joinable by anyone).

## Stack

- **apps/web** — React 19 + TanStack Start (SSR), Tailwind v4, TanStack DB
  collections over TrailBase record APIs (live subscriptions), Paraglide i18n
  (EN/FR), installable PWA.
- **services/trailbase** — [TrailBase](https://trailbase.io) (SQLite): auth,
  record APIs with row-level access rules, realtime subscriptions.
- External: Whisper (speech-to-text) and Meridian (Claude gateway), both
  proxied by the web app's server routes so their keys stay server-side.

## Development

```sh
pnpm install
cp apps/web/.env.example apps/web/.env   # set WHISPER_API_KEY / MERIDIAN_API_KEY, or FAKE_AI=1
pnpm dev
```

`dev.js` starts TrailBase (`trail` binary, install: `curl -sSL
https://trailbase.io/install.sh | bash`) and the Vite dev server, and prints
the admin credentials banner. App on http://localhost:3000, TrailBase admin on
http://localhost:4000/_/admin/.

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
