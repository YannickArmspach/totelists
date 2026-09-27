-- A tote is the sharing boundary: a shopping space one user creates and
-- others join. Markets and departments are NOT tote-owned — they form a
-- per-user reusable catalog, and a tote gains a market by attaching it
-- (tote_markets). Items carry a denormalized tote_id so record-API access
-- rules stay one EXISTS deep.

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

-- CATALOG: markets belong to their creator, not to a tote. Deleting the
-- creator's account keeps the market alive for totes still using it.
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
    -- Free text: what belongs in this department. Fed verbatim to the
    -- classifier prompt; the classifier also writes one when it auto-creates
    -- a department.
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
    -- such items surface in the inbox for manual routing (and are the whole
    -- list in a tote with no attached markets).
    market_id     BLOB REFERENCES markets(id) ON DELETE SET NULL,
    department_id BLOB REFERENCES departments(id) ON DELETE SET NULL,

    title         TEXT NOT NULL CHECK(length(title) > 0),
    number        REAL CHECK(number IS NULL OR number > 0),
    -- NULL = unspecified. Mirror of UNITS in apps/web/src/lib/classify/units.ts —
    -- keep the two lists in sync by hand.
    unit          TEXT CHECK(unit IN ('piece','g','kg','ml','cl','l','pack','bunch')),
    description   TEXT NOT NULL DEFAULT '',
    price_cents   INTEGER CHECK(price_cents IS NULL OR price_cents >= 0),

    status        TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','buy','bought')),
    bought_at     INTEGER,
    bought_by     BLOB REFERENCES _user(id) ON DELETE SET NULL,
    -- Manual drag-and-drop position within the item's display bucket
    -- (tote × market × department, incl. the root no-market bucket).
    -- Fractional ranking: insert at max+1, drop between neighbors = midpoint;
    -- the client rebalances a bucket when gaps get too small.
    sort          REAL NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL DEFAULT (UNIXEPOCH()),
    updated_at    INTEGER NOT NULL DEFAULT (UNIXEPOCH())
) STRICT;

CREATE INDEX items_tote_status_idx ON items (tote_id, status);
CREATE INDEX items_market_dept_idx ON items (market_id, department_id);
CREATE INDEX items_bought_idx ON items (tote_id, bought_at) WHERE bought_at IS NOT NULL;
