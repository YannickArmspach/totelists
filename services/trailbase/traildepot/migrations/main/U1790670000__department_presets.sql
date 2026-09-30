-- Departments stop belonging to one market.
--
-- "Produce" had to be recreated for every store, because departments.market_id
-- was NOT NULL. Now a department is either:
--   * a PRESET  (owner_market_id IS NULL) — reusable, lives in its creator's
--     catalog, attached to as many markets as you like, edited in one place;
--   * or CUSTOM (owner_market_id set)     — defined on one market, never
--     offered to another, and deleted with it.
-- Which markets use a department, and in what order there, moves to the
-- market_departments join table (the same shape as tote_markets).
--
-- Existing rows become CUSTOM to the market that owned them, which preserves
-- today's behaviour exactly: nothing is silently shared that was not before.

-- The join first, so it can be backfilled from departments.market_id/sort
-- while those columns still exist.
CREATE TABLE market_departments (
    id            BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
    market_id     BLOB NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    department_id BLOB NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    -- Order within THIS market: a preset can sit first in one store, third in
    -- another, which is why sort cannot live on the department any more.
    sort          INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL DEFAULT (UNIXEPOCH()),
    UNIQUE(market_id, department_id)
) STRICT;

CREATE INDEX market_departments_department_idx ON market_departments (department_id);

INSERT INTO market_departments (id, market_id, department_id, sort)
    SELECT uuid_v7(), market_id, id, sort FROM departments;

-- SQLite cannot drop a NOT NULL column in place, so departments is rebuilt.
CREATE TABLE departments_new (
    id                  BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
    created_by          BLOB REFERENCES _user(id) ON DELETE SET NULL,
    name                TEXT NOT NULL CHECK(length(name) > 0),
    -- Free text: what belongs in this department. Fed verbatim to the
    -- classifier prompt; the classifier also writes one when it auto-creates.
    classification_hint TEXT NOT NULL DEFAULT '',
    -- NULL = a reusable preset. Set = custom to that market, and cascaded away
    -- with it.
    owner_market_id     BLOB REFERENCES markets(id) ON DELETE CASCADE,
    -- 1 = proposed by the classifier (badged in UI, candidate for merge).
    auto_created        INTEGER NOT NULL DEFAULT 0 CHECK(auto_created IN (0,1)),
    created_at          INTEGER NOT NULL DEFAULT (UNIXEPOCH())
) STRICT;

INSERT INTO departments_new
    (id, created_by, name, classification_hint, owner_market_id, auto_created, created_at)
    SELECT id, created_by, name, classification_hint, market_id, auto_created, created_at
      FROM departments;

DROP TABLE departments;

ALTER TABLE departments_new RENAME TO departments;

-- Case-insensitive uniqueness still backs the AI-department dedupe, but the
-- scope now differs by kind: presets are unique within their creator's
-- catalog, custom departments within their market.
CREATE UNIQUE INDEX departments_preset_name_idx
    ON departments (created_by, name COLLATE NOCASE) WHERE owner_market_id IS NULL;

CREATE UNIQUE INDEX departments_custom_name_idx
    ON departments (owner_market_id, name COLLATE NOCASE) WHERE owner_market_id IS NOT NULL;

CREATE INDEX departments_owner_market_idx ON departments (owner_market_id);
