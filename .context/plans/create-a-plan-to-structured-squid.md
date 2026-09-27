# Tote — voice-first shared shopping lists

## Context

New app **Tote** (id: `tote`, domain `tote.markets`, baseline *"Say it, we bag it."*). A **tote** is a shared shopping space a user creates; they can invite others (multi-user) or keep it solo, and a tote is **private** (invite-link only) or **public** (any logged-in user can join). **Markets** (name + a free-text `classification_hint`: what's bought there) and their ordered **departments** (also carrying a `classification_hint`) are nested categories in a **per-user reusable catalog**: a tote explicitly *attaches* markets (or none — a tote with no markets is a simple flat list), and the same market can be attached to many totes. Markets/departments exist purely for AI classification and visual grouping/ordering. Departments are user-defined, but the AI classifier can auto-create new ones in a market. The home page has a big **"Say it"** button: record voice → transcribe via the Whisper service → Claude (via Meridian gateway) splits the transcript into items and routes each to the right attached market + department. Items flow **new → buy → bought** (review inbox → shopping list → in-store check-off; bought history kept). Real-time sync via TrailBase subscriptions. Voice input FR + EN auto-detect; UI EN + FR. Mobile-first installable PWA.

Catalog sharing rules (confirmed): a user reuses **their own** markets across their totes; tote members see (and can classify into) whatever markets the tote has attached, whoever created them. Editing a catalog entry: the **creator** gets a choice — "update everywhere" or "make a copy for this tote"; **non-creators always copy-on-write** (their edited copy replaces the attachment/references in that tote only). Any member of a tote may add departments to an attached market (that's what the AI does too); department edits follow the same creator/copy rules.

Monorepo modeled on `/Users/yannick/Projects/trainloop` — **branch `deploy/temps`** (currently checked out) — pnpm workspaces, React 19 + TanStack Start, Tailwind v4, TrailBase. **Without Directus**, **with a root `docker-compose.yml`**, plus Temps deployment to tote.markets.

Confirmed decisions: status `new → buy → bought`; multi-tote with public (joinable by anyone) / private (invite link with revocable code); FR+EN voice; EN+FR UI via **Paraglide JS** (officially recommended i18n for TanStack Start); mobile-first PWA; v1 extras = history view + manual quick-add + quick re-add suggestions; AI-proposed departments created immediately on classify; Temps deploy in scope. Item routing is AI-first but always user-overridable (inbox selects, edit dialog, or drag-and-drop between groups); items are manually sortable (nested dnd at root / market / department levels, fractional `items.sort`); a **cross-tote overview** groups `buy` items market → department across all my totes; `bought_by` records who checked an item off.

### Key facts from exploration (ground truth)

- **Whisper** (`https://whisper-production.dev.ynk.one`): `POST /v1/audio/transcriptions`, multipart field **`file`** (filename extension must match audio type — Safari records `audio/mp4`, Chrome `audio/webm`), optional `language` field, `Authorization: Bearer $WHISPER_API_KEY`, response `{"text": "..."}`. **No CORS + single static key → must be proxied by our server.** 503 on cold start (retry); latency ~recording length. Reference client: `/Users/yannick/Projects/whisper/app/static/index.html:185-247`.
- **Meridian** (`https://meridian.dev.ynk.one`): Anthropic-compatible `POST /v1/messages`, auth `x-api-key: $MERIDIAN_API_KEY`. Model **`claude-haiku-4-5`**. Structured output via `output_config: { format: { type: "json_schema", schema } }` — **cannot be combined with `tools`**; response = one text block of validated JSON. **Required headers:** `x-meridian-agent: passthrough` (else ~28KB system prompt prepended) and per-request `x-meridian-source: fork-<uuid>` (else session-fingerprint collisions). Key server-only → proxy. One batched call per transcript.
- **TrailBase access rules support SQL `EXISTS` subqueries** (verified in docs: `EXISTS(SELECT 1 FROM groups WHERE groups.member = _USER_.id ...)`) — membership-based ACLs are expressible directly in `config.textproto`. ACLs checked first, then access rules.
- **trainloop patterns to copy** (from branch `deploy/temps`; files under "Critical reference files"): `dev.js` orchestrator, TrailBase Dockerfile `/seed` re-seed entrypoint, `initClient` auth + localStorage tokens + PKCE, `@tanstack/trailbase-db-collection` collections, STRICT/uuid_v7 migrations, `record_apis`, multi-stage web Dockerfile (`VITE_*` build ARGs), `.temps.yaml` per service.

---

## Phase 0 — Repo scaffold

```
totelists/
├── package.json                  # name "tote", pnpm@10.x, scripts dev/dev:web/dev:tb/build/test/typecheck
├── pnpm-workspace.yaml           # apps/*, services/* (copy trainloop's incl. onlyBuiltDependencies)
├── dev.js                        # copy trainloop/dev.js, relabel (Tote banner/URLs)
├── docker-compose.yml            # NEW (below)
├── .env.example  .gitignore  .temps.yaml (web)  README.md
├── apps/web/                     # "@tote/web"
│   ├── Dockerfile                # adapted from trainloop root Dockerfile (build context stays repo root)
│   ├── package.json  vite.config.ts  tsconfig.json  tsr.config.json  vitest.config.ts  components.json
│   ├── project.inlang/ + messages/en.json, messages/fr.json   # Paraglide
│   ├── public/manifest.webmanifest  public/sw.js  public/icons/*
│   └── src/ (routes/, db/, lib/, hooks/, components/, paraglide/ (generated), styles.css, router.tsx)
└── services/trailbase/           # "@tote/trailbase"
    ├── package.json              # dev: trail run --cors-allowed-origins http://localhost:3000
    ├── Dockerfile  docker-entrypoint.sh   # copy trainloop's verbatim (FROM trailbase/trailbase:0.33.20, /seed pattern)
    ├── .temps.yaml
    └── traildepot/config.textproto + migrations/main/U<epoch>__tote_schema.sql
```

- pnpm overrides `"trailbase": "^0.14.1"`. Web deps: react 19, @tanstack/react-start/router/react-query/react-db, `@tanstack/trailbase-db-collection`, `trailbase`, tailwindcss v4 + `@tailwindcss/vite`, shadcn/ui (new-york, alias `#/*`), zod, zustand, lucide-react, date-fns, srvx, **@inlang/paraglide-js** (Vite plugin), **@dnd-kit/core + @dnd-kit/sortable** (nested item dnd); dev: router-cli, vitest, jsdom, testing-library.
- **Env:** `VITE_TRAILBASE_URL`, `VITE_SITE_URL` → client bundle, Docker build ARGs (browser-visible origins — document in `.env.example`). Server-only runtime: `WHISPER_URL`, `WHISPER_API_KEY`, `MERIDIAN_URL`, `MERIDIAN_API_KEY`, `FAKE_AI`.

**Root `docker-compose.yml`:** `trailbase` (build `./services/trailbase`, `127.0.0.1:4000:4000`, env `PUBLIC_URL`+`CORS_ALLOWED_ORIGINS`, volume `traildepot:/app/traildepot`, healthcheck `wget -qO- http://127.0.0.1:4000/api/healthcheck`) and `web` (build **context `.` / dockerfile `apps/web/Dockerfile`**, build args `VITE_*`, runtime whisper/meridian env, `127.0.0.1:3000:3000`, `depends_on: trailbase: condition: service_healthy`).

## Phase 1 — TrailBase schema + ACLs

### Entity model

```
_user (TrailBase built-in)
  │ created_by / user_id
  ▼
totes ──< tote_members  (user ∈ tote, role owner|member)
  │
  ├──< tote_markets >── markets          ← per-user CATALOG, reusable across totes
  │    (attach + per-tote     │
  │     sort order)           └──< departments  (ordered within market;
  │                                  │           user-defined or AI auto_created)
  └──< items ── market_id? ──────────┘
        (denormalized tote_id for ACLs; market_id/department_id nullable:
         no market = flat-list tote or unrouted → inbox)
```

- A tote with no `tote_markets` rows is a plain flat list (Tote 1 in the spec example).
- The same market can be attached to many totes (Tote 3 reuses Tote 2's Market 2); departments shown in a tote are **emergent** — those that currently have items in that tote — ordered by `departments.sort`.
- Markets/departments have **no tote_id**: they are catalog entities owned by `created_by`. Reach (who can read them) derives from attachments, expressed in access rules below.
- Copy-on-write is client-side logic, not schema: "copy for this tote" = insert a new market (+ clone its departments), repoint this tote's `tote_markets` row and this tote's items to the copy.

Conventions (trainloop idioms, see `U1789847071__trainloop_schema.sql`): all tables `STRICT`; ids `BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7())` — the record API serializes them as URL-safe base64 **strings** on the wire, so all TS row types use `string` ids; timestamps are unix-epoch `INTEGER` (`DEFAULT (UNIXEPOCH())`); no update triggers — the client sets `updated_at` on writes (trainloop pattern).

### Migration `services/trailbase/traildepot/migrations/main/U<epoch>__tote_schema.sql`

```sql
-- A tote is the sharing boundary: a shopping space one user creates and
-- others join. Everything below it (markets, departments, items) carries a
-- denormalized tote_id so record-API access rules stay one EXISTS deep.

CREATE TABLE totes (
    id          BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
    created_by  BLOB REFERENCES _user(id) ON DELETE SET NULL,
    name        TEXT NOT NULL CHECK(length(name) > 0),
    -- 'public': any authenticated user may read and join.
    -- 'private': readable/joinable only via membership or invite_code.
    visibility  TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public')),
    -- Join secret for private totes; NULL = link joining disabled.
    -- Regenerating revokes every previously shared link.
    invite_code TEXT,
    created_at  INTEGER NOT NULL DEFAULT (UNIXEPOCH()),
    updated_at  INTEGER NOT NULL DEFAULT (UNIXEPOCH())
) STRICT;

CREATE TABLE tote_members (
    id               BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
    tote_id          BLOB NOT NULL REFERENCES totes(id) ON DELETE CASCADE,
    user_id          BLOB NOT NULL REFERENCES _user(id) ON DELETE CASCADE,
    role             TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','member')),
    -- Proof-of-invite: the code the joiner presented, checked by the CREATE
    -- access rule against totes.invite_code. Kept only as an audit trail.
    joined_with_code TEXT,
    created_at       INTEGER NOT NULL DEFAULT (UNIXEPOCH()),
    UNIQUE(tote_id, user_id)
) STRICT;
CREATE INDEX tote_members_user_idx ON tote_members (user_id);

-- CATALOG: markets belong to their creator, not to a tote. A tote gains a
-- market by attaching it (tote_markets). Deleting the creator's account keeps
-- the market alive for totes still using it (SET NULL).
CREATE TABLE markets (
    id                  BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
    created_by          BLOB REFERENCES _user(id) ON DELETE SET NULL,
    name                TEXT NOT NULL CHECK(length(name) > 0),
    -- Free text: "what we buy here". Fed verbatim to the classifier prompt.
    classification_hint TEXT NOT NULL DEFAULT '',
    created_at          INTEGER NOT NULL DEFAULT (UNIXEPOCH()),
    updated_at          INTEGER NOT NULL DEFAULT (UNIXEPOCH())
) STRICT;
CREATE INDEX markets_creator_idx ON markets (created_by);

-- CATALOG: nested category under a market. Any member of a tote that attached
-- the market may add departments (the AI classifier does exactly that).
CREATE TABLE departments (
    id                  BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
    market_id           BLOB NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    created_by          BLOB REFERENCES _user(id) ON DELETE SET NULL,
    name                TEXT NOT NULL CHECK(length(name) > 0),
    -- Free text: what belongs in this department ("produits frais: yaourts,
    -- lait, œufs…"). Fed verbatim to the classifier prompt; the classifier
    -- also writes one when it auto-creates a department.
    classification_hint TEXT NOT NULL DEFAULT '',
    -- Visual order within the market (shared by every tote using it).
    sort                INTEGER NOT NULL DEFAULT 0,
    -- 1 = proposed by the classifier (badged in UI, candidate for merge).
    auto_created        INTEGER NOT NULL DEFAULT 0 CHECK(auto_created IN (0,1)),
    created_at          INTEGER NOT NULL DEFAULT (UNIXEPOCH())
) STRICT;
-- Case-insensitive uniqueness backs the AI-department dedupe: a concurrent
-- duplicate insert fails and the client falls back to the existing row.
CREATE UNIQUE INDEX departments_market_name_idx
    ON departments (market_id, name COLLATE NOCASE);

-- The attach: which catalog markets a tote uses, and in what order. These are
-- the AI's routing candidates and the list page's section order.
CREATE TABLE tote_markets (
    id         BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
    tote_id    BLOB NOT NULL REFERENCES totes(id) ON DELETE CASCADE,
    market_id  BLOB NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    sort       INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (UNIXEPOCH()),
    UNIQUE(tote_id, market_id)
) STRICT;
CREATE INDEX tote_markets_market_idx ON tote_markets (market_id);

CREATE TABLE items (
    id            BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
    tote_id       BLOB NOT NULL REFERENCES totes(id) ON DELETE CASCADE,
    created_by    BLOB REFERENCES _user(id) ON DELETE SET NULL,
    -- NULL market/department = the classifier (or user) hasn't routed it yet;
    -- such items surface in the inbox for manual routing.
    market_id     BLOB REFERENCES markets(id) ON DELETE SET NULL,
    department_id BLOB REFERENCES departments(id) ON DELETE SET NULL,

    title         TEXT NOT NULL CHECK(length(title) > 0),
    number        REAL CHECK(number IS NULL OR number > 0),   -- 1.5 (kg) is legal
    -- NULL = unspecified. Mirror of UNITS in src/lib/classify/units.ts —
    -- keep the two lists in sync by hand.
    unit          TEXT CHECK(unit IN ('piece','g','kg','ml','cl','l','pack','bunch')),
    description   TEXT NOT NULL DEFAULT '',
    price_cents   INTEGER CHECK(price_cents IS NULL OR price_cents >= 0),

    status        TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','buy','bought')),
    bought_at     INTEGER,      -- set when status flips to 'bought'
    bought_by     BLOB REFERENCES _user(id) ON DELETE SET NULL,  -- who checked it off
    -- Manual drag-and-drop position within the item's display bucket
    -- (tote × market × department, incl. the root no-market bucket).
    -- Fractional ranking: insert at max+1, drop between neighbors = midpoint;
    -- client rebalances a bucket when gaps get too small.
    sort          REAL NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL DEFAULT (UNIXEPOCH()),   -- the "date" field
    updated_at    INTEGER NOT NULL DEFAULT (UNIXEPOCH())
) STRICT;
CREATE INDEX items_tote_status_idx  ON items (tote_id, status);
CREATE INDEX items_market_dept_idx  ON items (market_id, department_id);
CREATE INDEX items_bought_idx       ON items (tote_id, bought_at) WHERE bought_at IS NOT NULL;
```

Field-mapping notes: `price_cents INTEGER` (STRICT-friendly, no float drift; UI formats €/locale); `number REAL` for fractional quantities; the requirement's "date" = `created_at`; "user" = `created_by` (attribution only — grants nothing, `ON DELETE SET NULL` keeps household data when an account is deleted).

### `config.textproto`

Header copied from trainloop (`email {}` empty in dev, `server`, `auth`, `jobs` with the BACKUP cron), with `application_name: "Tote"` and `redirect_uri_allowlist: ["http://localhost:3000/auth/callback", "https://tote.markets/auth/callback"]`. Then one `record_apis` entry per table — full listing (ACLs checked first, then rules; `EXISTS` subqueries verified supported):

```textproto
record_apis: [{
  name: "totes"
  table_name: "totes"
  acl_authenticated: [CREATE, READ, UPDATE, DELETE]
  enable_subscriptions: true
  create_access_rule: "_REQ_.created_by = _USER_.id"
  read_access_rule:   "_ROW_.visibility = 'public' OR EXISTS(SELECT 1 FROM tote_members m WHERE m.tote_id = _ROW_.id AND m.user_id = _USER_.id)"
  update_access_rule: "EXISTS(SELECT 1 FROM tote_members m WHERE m.tote_id = _ROW_.id AND m.user_id = _USER_.id AND m.role = 'owner')"
  delete_access_rule: "EXISTS(SELECT 1 FROM tote_members m WHERE m.tote_id = _ROW_.id AND m.user_id = _USER_.id AND m.role = 'owner')"
}, {
  name: "tote_members"
  table_name: "tote_members"
  acl_authenticated: [CREATE, READ, UPDATE, DELETE]
  enable_subscriptions: true
  # The join rule. You may only insert yourself, and only when one of:
  #   1. the tote is public;
  #   2. you presented the current invite_code (private tote, link join);
  #   3. you created the tote (bootstrap of the owner row).
  # Role escalation guard: 'owner' insertable only by the tote creator.
  create_access_rule: "_REQ_.user_id = _USER_.id AND (EXISTS(SELECT 1 FROM totes t WHERE t.id = _REQ_.tote_id AND t.visibility = 'public') OR EXISTS(SELECT 1 FROM totes t WHERE t.id = _REQ_.tote_id AND t.invite_code IS NOT NULL AND t.invite_code = _REQ_.joined_with_code) OR EXISTS(SELECT 1 FROM totes t WHERE t.id = _REQ_.tote_id AND t.created_by = _USER_.id)) AND (_REQ_.role IS NULL OR _REQ_.role = 'member' OR EXISTS(SELECT 1 FROM totes t WHERE t.id = _REQ_.tote_id AND t.created_by = _USER_.id))"
  read_access_rule:   "EXISTS(SELECT 1 FROM tote_members m WHERE m.tote_id = _ROW_.tote_id AND m.user_id = _USER_.id) OR EXISTS(SELECT 1 FROM totes t WHERE t.id = _ROW_.tote_id AND t.visibility = 'public')"
  # Only owners touch roles.
  update_access_rule: "EXISTS(SELECT 1 FROM tote_members m WHERE m.tote_id = _ROW_.tote_id AND m.user_id = _USER_.id AND m.role = 'owner')"
  # Leave (self) or kick (owner).
  delete_access_rule: "_ROW_.user_id = _USER_.id OR EXISTS(SELECT 1 FROM tote_members m WHERE m.tote_id = _ROW_.tote_id AND m.user_id = _USER_.id AND m.role = 'owner')"
}, {
  name: "markets"
  table_name: "markets"
  acl_authenticated: [CREATE, READ, UPDATE, DELETE]
  enable_subscriptions: true
  # Catalog entry. You see a market if it's yours, or it's attached to a tote
  # you're a member of, or attached to a public tote.
  create_access_rule: "_REQ_.created_by = _USER_.id"
  read_access_rule:   "_ROW_.created_by = _USER_.id OR EXISTS(SELECT 1 FROM tote_markets tm JOIN tote_members m ON m.tote_id = tm.tote_id WHERE tm.market_id = _ROW_.id AND m.user_id = _USER_.id) OR EXISTS(SELECT 1 FROM tote_markets tm JOIN totes t ON t.id = tm.tote_id WHERE tm.market_id = _ROW_.id AND t.visibility = 'public')"
  # In-place edits are creator-only ("update everywhere"). Everyone else goes
  # through client-side copy-on-write.
  update_access_rule: "_ROW_.created_by = _USER_.id"
  delete_access_rule: "_ROW_.created_by = _USER_.id"
}, {
  name: "departments"
  table_name: "departments"
  acl_authenticated: [CREATE, READ, UPDATE, DELETE]
  enable_subscriptions: true
  # Anyone who can use the market may add departments to it: its creator, or a
  # member of any tote that attached it. (This is also how the AI's proposed
  # departments get created, on the speaking user's token.)
  create_access_rule: "_REQ_.created_by = _USER_.id AND EXISTS(SELECT 1 FROM markets w WHERE w.id = _REQ_.market_id AND (w.created_by = _USER_.id OR EXISTS(SELECT 1 FROM tote_markets tm JOIN tote_members m ON m.tote_id = tm.tote_id WHERE tm.market_id = w.id AND m.user_id = _USER_.id)))"
  # Readable wherever the parent market is readable.
  read_access_rule:   "EXISTS(SELECT 1 FROM markets w WHERE w.id = _ROW_.market_id AND (w.created_by = _USER_.id OR EXISTS(SELECT 1 FROM tote_markets tm JOIN tote_members m ON m.tote_id = tm.tote_id WHERE tm.market_id = w.id AND m.user_id = _USER_.id) OR EXISTS(SELECT 1 FROM tote_markets tm JOIN totes t ON t.id = tm.tote_id WHERE tm.market_id = w.id AND t.visibility = 'public')))"
  # In-place edit: department creator or the market creator; others copy-on-write.
  update_access_rule: "_ROW_.created_by = _USER_.id OR EXISTS(SELECT 1 FROM markets w WHERE w.id = _ROW_.market_id AND w.created_by = _USER_.id)"
  delete_access_rule: "_ROW_.created_by = _USER_.id OR EXISTS(SELECT 1 FROM markets w WHERE w.id = _ROW_.market_id AND w.created_by = _USER_.id)"
}, {
  name: "tote_markets"
  table_name: "tote_markets"
  acl_authenticated: [CREATE, READ, UPDATE, DELETE]
  enable_subscriptions: true
  # Attaching: you must be a member of the tote AND able to read the market
  # (yours, or reachable through one of your totes).
  create_access_rule: "EXISTS(SELECT 1 FROM tote_members m WHERE m.tote_id = _REQ_.tote_id AND m.user_id = _USER_.id) AND EXISTS(SELECT 1 FROM markets w WHERE w.id = _REQ_.market_id AND (w.created_by = _USER_.id OR EXISTS(SELECT 1 FROM tote_markets tm JOIN tote_members m2 ON m2.tote_id = tm.tote_id WHERE tm.market_id = w.id AND m2.user_id = _USER_.id)))"
  read_access_rule:   "EXISTS(SELECT 1 FROM tote_members m WHERE m.tote_id = _ROW_.tote_id AND m.user_id = _USER_.id) OR EXISTS(SELECT 1 FROM totes t WHERE t.id = _ROW_.tote_id AND t.visibility = 'public')"
  # Reorder / detach: any member of the tote.
  update_access_rule: "EXISTS(SELECT 1 FROM tote_members m WHERE m.tote_id = _ROW_.tote_id AND m.user_id = _USER_.id)"
  delete_access_rule: "EXISTS(SELECT 1 FROM tote_members m WHERE m.tote_id = _ROW_.tote_id AND m.user_id = _USER_.id)"
}, {
  name: "items"
  table_name: "items"
  acl_authenticated: [CREATE, READ, UPDATE, DELETE]
  enable_subscriptions: true
  # Membership + attribution + integrity (market, when set, must be ATTACHED
  # to this tote via tote_markets).
  create_access_rule: "_REQ_.created_by = _USER_.id AND EXISTS(SELECT 1 FROM tote_members m WHERE m.tote_id = _REQ_.tote_id AND m.user_id = _USER_.id) AND (_REQ_.market_id IS NULL OR EXISTS(SELECT 1 FROM tote_markets tm WHERE tm.tote_id = _REQ_.tote_id AND tm.market_id = _REQ_.market_id))"
  read_access_rule:   "EXISTS(SELECT 1 FROM tote_members m WHERE m.tote_id = _ROW_.tote_id AND m.user_id = _USER_.id) OR EXISTS(SELECT 1 FROM totes t WHERE t.id = _ROW_.tote_id AND t.visibility = 'public')"
  update_access_rule: "EXISTS(SELECT 1 FROM tote_members m WHERE m.tote_id = _ROW_.tote_id AND m.user_id = _USER_.id)"
  delete_access_rule: "EXISTS(SELECT 1 FROM tote_members m WHERE m.tote_id = _ROW_.tote_id AND m.user_id = _USER_.id)"
}]
```

Design notes:
- **Sharing semantics**: public tote = readable + joinable by any authenticated user, but only members write. Private tote rows are invisible to non-members (so a private tote can't be looked up by invite code — the join link therefore carries **both** `toteId` and `code`: `/join/$toteId/$code`; the joiner inserts a membership blind, the create rule validates it).
- **`invite_code` exposure**: any member of a private tote can read the code (household semantics — every member may share the link). For public totes the code is moot. No per-column ACL needed.
- **Create-tote bootstrap** is two inserts from the client on the creator's token: the `totes` row, then their own `tote_members` row with `role: 'owner'` (clause 3 of the join rule permits it).
- **Edit flows for catalog entries** (pure client logic on top of the rules above):
  - *Creator edits* a market/department attached to >1 tote → dialog: **"Update everywhere"** (plain UPDATE, allowed by the rule) or **"Copy for this tote"**.
  - *Non-creator edits* → always **copy-on-write** (UPDATE would be denied anyway): insert a new market owned by the editor (clone its departments, preserving `sort`/`auto_created`), UPDATE this tote's `tote_markets` row to point at the copy, and batch-update this tote's items (`market_id`, and each `department_id` → its clone). Department-only copy-on-write is the same in miniature: new department in the same market, repoint this tote's items.
  - Detaching a market from a tote (`tote_markets` DELETE) nulls that tote's item references client-side (items keep their titles, drop into the flat/inbox bucket).
- Day-one checks (before building UI): confirm `_REQ_.joined_with_code` is visible to the CREATE rule on insert; confirm `JOIN` inside access-rule `EXISTS` subqueries is accepted (docs show plain EXISTS — if JOINs are rejected, rewrite as nested EXISTS); confirm subscriptions still deliver on tables with read rules (events filtered per the read rule) — **note markets/departments subscriptions depend on rows the rule reaches via other tables, so a fresh attach won't retro-fire events; the client should refetch catalog collections after attach**; curl-test the whole ACL matrix (see Verification). Fallback if the join rule misbehaves: a small server route holding a TrailBase service token performs validated joins.

## Phase 2 — Server API routes (TanStack Start `server.handlers`)

- **`src/routes/api.transcribe.ts`** — POST: `formData()` field `audio` (+ optional `language` fr|en); filename derived from `blob.type` (helper `src/lib/audio.ts`, unit-tested: `audio/webm→rec.webm`, `audio/mp4→rec.mp4`, `audio/ogg→rec.ogg`, else `rec.bin`); forward as field `file` with Bearer key; retry 503 3× (2s backoff); reject >15MB; return `{text}`; 502 on upstream failure; `FAKE_AI=1` → canned transcript.
- **`src/routes/api.classify.ts`** — POST `{transcript, language?, markets:[{id,name,classification_hint,departments:[{id,name,classification_hint}]}]}` — the markets **attached to the active tote** (via `tote_markets`, in per-tote `sort` order) with each market's full department list; both levels carry their `classification_hint` so the model routes precisely. An **empty `markets` array is valid** (flat-list tote): the prompt then only splits/parses items (title/number/unit/description/price) and every `market_id` is null. One Meridian call: model `claude-haiku-4-5`, headers `x-api-key`, `x-meridian-agent: passthrough`, `x-meridian-source: fork-${crypto.randomUUID()}`, `output_config.format.json_schema` = **CLASSIFY_SCHEMA** (`src/lib/classify/schema.ts`): `items[]` of `{title (req), number?, unit? (enum|null), description?, price_cents?, market_id (string|null), department_id (string|null), new_department_name (string|null), new_department_hint (string|null), confidence?}` — **`new_department_name`** set only when the market fits but no listed department does (AI-proposed department), with **`new_department_hint`** a one-line "what belongs here" written by the model (stored as the new department's `classification_hint`, so future classifications get sharper). System prompt from pure `buildClassifyPrompt(markets)` (`src/lib/classify/prompt.ts`): split spoken FR/EN note into items, expand enumerations, parse quantities ("deux kilos" → 2 kg), never invent ids; route using each market's and department's `classification_hint`; prefer an existing department; propose `new_department_name` (+hint, short, in the tote's language) only when clearly none fits; null market when nothing fits; prices only if spoken. Parse `content[0].text`, zod re-validate, **post-validate ids** (null unknown market_id / department_id not of that market; drop `new_department_name` if a case-insensitive name match exists → use that id). `FAKE_AI=1` → canned parse.
- `src/routes/healthz.ts` — copy trainloop's.

Department auto-creation happens **client-side right after classify** (on the user's own TrailBase token, so ACLs apply): dedupe proposed names per market case-insensitively, insert `departments` rows with `auto_created: 1` and the model's `new_department_hint` as `classification_hint`, then insert items pointing at them.

## Phase 3 — Auth, data layer, core UI

- **Auth**: copy/trim trainloop `apps/web/src/lib/auth.ts` (`initClient`, tokens in localStorage `tote:auth:v1`, PKCE); routes `login.tsx`, `register.tsx`, `auth.callback.tsx`. Account-only: `_authed` layout redirects to `/login` when no stored session.
- **`src/db/collections.ts`**: trainloop's pattern, remote branch only — `trailBaseCollectionOptions` over `client.records(...)` for totes/tote_members/markets/departments/items; subscriptions = live sync. **Active tote id** in a zustand store persisted to localStorage; collection queries filter by it. Row types (ids are base64 strings on the wire):

  ```ts
  type Visibility = 'private' | 'public'
  type Role = 'owner' | 'member'
  type Unit = 'piece' | 'g' | 'kg' | 'ml' | 'cl' | 'l' | 'pack' | 'bunch'   // from lib/classify/units.ts
  type Status = 'new' | 'buy' | 'bought'

  interface ToteRow       { id: string; created_by: string | null; name: string; visibility: Visibility;
                            invite_code: string | null; created_at?: number; updated_at?: number }
  interface ToteMemberRow { id: string; tote_id: string; user_id: string; role: Role;
                            joined_with_code: string | null; created_at?: number }
  interface MarketRow     { id: string; created_by: string | null; name: string;          // catalog entity
                            classification_hint: string; created_at?: number; updated_at?: number }
  interface DepartmentRow { id: string; market_id: string; created_by: string | null;     // catalog entity
                            name: string; classification_hint: string; sort: number;
                            auto_created: 0 | 1; created_at?: number }
  interface ToteMarketRow { id: string; tote_id: string; market_id: string; sort: number; created_at?: number }
  interface ItemRow       { id: string; tote_id: string; created_by: string | null;
                            market_id: string | null; department_id: string | null;
                            title: string; number: number | null; unit: Unit | null; description: string;
                            price_cents: number | null; status: Status;
                            bought_at: number | null; bought_by: string | null; sort: number;
                            created_at?: number; updated_at?: number }
  ```
- **Routes**:
  - `index.tsx` — active-tote home: giant "Say it" button + baseline, inbox badge (`new` count), market tiles with `buy` counts, **manual quick-add input** (typed text → same classify flow, skipping transcription), tote switcher in header.
  - `totes.tsx` / `totes.new.tsx` — my totes (member of) + discover public totes; create tote (inserts tote + own `owner` membership + generated `invite_code`).
  - `totes.$toteId.settings.tsx` — rename, visibility toggle, members list (remove; owner only), invite link `https://tote.markets/join/$toteId/$code` with copy + regenerate (regenerating revokes old links).
  - `join.$toteId.$code.tsx` — logged-in user lands here → insert `tote_members` row with `joined_with_code: code` → on success set active tote and go home; friendly error if code invalid/revoked. Public totes join without code.
  - `inbox.tsx` — review `new` items: editable market/department selects (auto-created departments badged), qty/title edit, Promote → `buy`, Delete, "Promote all".
  - `markets.$marketId.tsx` — in-store list for the active tote: `buy` items grouped by department (**emergent**: only departments that have items here, ordered by `departments.sort`, null-department bucket last as "Other"), items within a group ordered by `items.sort`, big tap targets, tap → `bought` + `bought_at` + **`bought_by`** (avatar/initial shown on bought rows and in history), collapsible "bought today" with undo, **quick re-add chips** (frequent bought titles for this tote+market → one tap re-adds as `buy`). A tote with no attached markets skips this level entirely — `index.tsx` shows the flat `buy` list inline (Tote 1 example).
  - `overview.tsx` — **cross-tote view**: all `buy` items from every tote I'm a member of, grouped **market → department** (each item badged with its tote), so one glance shows "I need things from Market 2 for both Family Food and BBC". Pure client-side live query over the unfiltered items/tote_markets collections — no schema change needed (items carry `tote_id` + `market_id` + `department_id`). Secondary toggle: group by tote (the classic view).
  - **Drag-and-drop everywhere** (dnd-kit: `@dnd-kit/core` + `@dnd-kit/sortable`, nested containers): reorder items within the root (no-market) list, within a department, and **across groups** — dropping an item on another market/department updates its `market_id`/`department_id` (manual classification override) plus its fractional `sort`. So routing an item is either the AI's call, the inbox selects, or a drag. Reorder logic in `src/lib/items.ts` (`sortBetween(prev, next)` midpoint ranking + bucket rebalance when gaps vanish).
  - `markets.tsx` — the active tote's attached markets: reorder/detach (`tote_markets`), **attach picker** ("My markets" = own catalog + markets reachable via my other totes) and "New market" form (name, `classification_hint` textarea — "what do you buy here? helps Tote route items"). The departments editor gets the same hint field per department (pre-filled by the AI on auto-created ones). Market/department edit dialog implements the **creator → "update everywhere / copy for this tote"** choice and silent copy-on-write for non-creators (logic in `src/lib/catalog.ts`: `copyMarketForTote(toteId, marketId, edits)` clones market + departments and repoints tote_markets + items). Inline departments editor per market (add/rename/delete/reorder; `auto_created` badge; merge = repoint items then delete).
  - `history.tsx` — `bought` items grouped by day.
- Pure logic in `src/lib/items.ts` (`promote`, `checkOff(item, userId)` → sets `bought_at` + `bought_by`, `undo`, `groupByDepartment`, `groupByMarketAcrossTotes`, `topBoughtTitles`, `sortBetween`/`rebalanceBucket` for dnd ranking) — unit-test targets.
- Collections note: the items/tote_markets collections sync **unfiltered** (everything the read rules allow — i.e. all my totes); per-view filtering (active tote, status, market) happens in TanStack DB live queries, which is what makes `overview.tsx` free.
- **i18n — Paraglide JS** (recommended by TanStack docs; compile-time, type-safe, tree-shakable, SSR-safe): `@inlang/paraglide-js` Vite plugin, `messages/en.json` + `messages/fr.json`, locale from `navigator.language` persisted in localStorage, toggle in tote/user menu. All UI strings are Paraglide messages from day 1.

## Phase 4 — Voice flow

- **`src/hooks/use-recorder.ts`**: `getUserMedia({audio:true})`, `MediaRecorder` with first supported of `audio/webm;codecs=opus` → `audio/webm` → `audio/mp4` (Safari); Blob from `recorder.mimeType`; release tracks; tap-to-toggle + hold-to-talk; ~60s cap. (Reference: whisper `app/static/index.html`.)
- **`src/hooks/use-say-it.ts`** state machine `idle → recording → transcribing → classifying → done|error`: stop → POST `/api/transcribe` → show transcript → POST `/api/classify` with active tote's markets → create proposed departments (`auto_created: 1`) → insert items as `status:'new'` with `tote_id` + `created_by` → toast "N items bagged". Error state keeps transcript for classify retry without re-recording. Manual quick-add reuses the classify half.
- Home button: pulsing + elapsed while recording, "Transcribing…/Sorting…", retry on error.

## Phase 5 — PWA + mobile polish

- `manifest.webmanifest`: name "Tote", description "Say it, we bag it.", `id: "tote"`, standalone, theme colors, icons 192/512/maskable; head links + `apple-mobile-web-app-*` meta in `__root.tsx`.
- Hand-rolled `public/sw.js` (vite-plugin-pwa awkward with TanStack Start SSR): precache shell, network-first navigations with cache fallback, passthrough `/api/*`; register in client-only effect.
- 44px+ targets, safe-area insets, sticky bottom "Say it" on list pages. `getUserMedia` needs HTTPS or localhost (LAN testing needs a tunnel).

## Phase 6 — Temps deployment (tote.markets)

Follow trainloop `deploy/temps` branch setup (use the `temps` skill when executing):

- `services/trailbase/.temps.yaml` — health `/api/healthcheck`; deploy `tote-trailbase`, persistent traildepot volume, env `PUBLIC_URL` (e.g. `https://api.tote.markets`) + `CORS_ALLOWED_ORIGINS=https://tote.markets`.
- Root `.temps.yaml` for web (dockerfile `apps/web/Dockerfile`, context repo root) — health `/healthz`; build args `VITE_TRAILBASE_URL=https://api.tote.markets`, `VITE_SITE_URL=https://tote.markets`; **secrets** `WHISPER_API_KEY`, `MERIDIAN_API_KEY` (values live in the whisper/meridian Temps project envs); env `WHISPER_URL`/`MERIDIAN_URL`.
- Wire `tote.markets` (web) + API subdomain (trailbase); prod callback already in `redirect_uri_allowlist`.
- TrailBase config is force-restored read-only on boot — edit `config.textproto` in git, not the admin UI.

## Verification

- **Unit (vitest)**: `prompt.test.ts` (all market/department ids + names + classification_hints present, stable order, empty-markets flat mode), `schema.test.ts` (accepts golden Meridian payload; nulls unknown ids; `new_department_name` de-duped against existing names; unit enum matches SQL CHECK), `items.test.ts` (transitions incl. `bought_by`, per-tote and cross-tote grouping, suggestions, `sortBetween` midpoint + rebalance edge cases), `audio.test.ts` (mime→extension).
- **ACL smoke (curl, day one)**: as user A create tote + market + attach + item; as user B (non-member) confirm read/write denied on private tote and its attached market, allowed to join public; join private via code → read/write allowed, and A's attached market becomes readable; wrong code denied; B adds a department to A's market (allowed — attached tote member), B UPDATEs A's market (denied → copy-on-write path), B attaches A's market to B's own tote (allowed — reachable via shared tote); item create with a market **not attached** to the tote is denied.
- **Local e2e**: `pnpm install && pnpm dev` → admin UI shows tables/APIs → register (**check:** TrailBase blocks login until email verification and dev has no SMTP — verify via admin UI or find the 0.33 dev switch; document in README) → `FAKE_AI=1` full loop offline (voice → inbox incl. an auto-created department → promote → check off), two browsers for live sync across two members → real FR + EN recordings against whisper (expect a 503 cold-start retry) and meridian ("deux kilos de tomates" → number 2, unit kg, right market; an item needing a new department actually creates one).
- **Compose**: `docker compose up --build` → healthchecks green → same loop → `down`/`up` proves volume + re-seed. API smoke: `curl -F audio=@sample.mp4 localhost:3000/api/transcribe`.
- **Deploy**: Temps deploy both services, hit `https://tote.markets`, real voice loop + join-link flow on a phone (PWA install + mic).

## Risks / notes

1. **Join rule via `_REQ_.joined_with_code`** — the one novel ACL trick; validate with curl before UI (fallback: a server route holding a TrailBase service token to perform joins).
1b. **Catalog access rules use `JOIN` inside `EXISTS`** — docs only show plain `EXISTS`; verify on day one, rewrite as nested `EXISTS` if needed. Also: these attachment-reachability subqueries run per row on reads — trivial at household scale, revisit only if catalog lists ever feel slow.
1c. **Copy-on-write is multi-step client-side** (clone market, clone departments, repoint tote_markets + items) with no transaction across record-API calls — order the writes so a mid-failure leaves the tote on the original market (create copies first, repoint last), and make `copyMarketForTote` idempotent/retryable.
2. **Meridian id fidelity**: model must echo base64 uuid ids exactly; post-validation nulls bad ids; fallback to short aliases (`m1`, `m1d2`) mapped server-side if hallucination shows up.
3. **AI department sprawl**: prompt says "prefer existing, propose only when clearly none fits" + case-insensitive dedupe + `auto_created` badge + easy rename/merge in the departments editor.
4. **iOS Safari MediaRecorder** (`audio/mp4`) — test on a real iPhone during Phase 4.
5. trailbase npm 0.14.x ↔ server 0.33.x is trainloop's exact pairing — pin both.
6. Concurrent edits last-write-wins — fine for shopping lists.
7. Whisper/Meridian keys come from their Temps project envs (not in local files).

## Critical reference files (trainloop @ `deploy/temps`)

- `/Users/yannick/Projects/trainloop/dev.js` — dev orchestrator (near-verbatim)
- `/Users/yannick/Projects/trainloop/apps/web/src/lib/auth.ts` — auth (initClient, tokens, PKCE)
- `/Users/yannick/Projects/trainloop/apps/web/src/db/collections.ts` — collections (remote branch only)
- `/Users/yannick/Projects/trainloop/services/trailbase/` — Dockerfile + docker-entrypoint.sh (verbatim), config.textproto + migrations (idioms)
- `/Users/yannick/Projects/trainloop/Dockerfile` — web image → becomes `apps/web/Dockerfile` (trim Sentry/tracing/temps; context stays repo root)
- `/Users/yannick/Projects/whisper/app/static/index.html` — MediaRecorder + upload reference
- trainloop root + service `.temps.yaml` — Temps config shape
