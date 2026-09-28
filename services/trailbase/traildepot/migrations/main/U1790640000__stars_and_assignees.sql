-- Stars pin an item to the top of its bucket (the star sets `sort` below the
-- bucket minimum; display order stays purely sort-driven), and items can be
-- assigned to a member of the tote.

ALTER TABLE items ADD COLUMN starred INTEGER NOT NULL DEFAULT 0 CHECK(starred IN (0,1));
ALTER TABLE items ADD COLUMN assigned_to BLOB REFERENCES _user(id) ON DELETE SET NULL;
