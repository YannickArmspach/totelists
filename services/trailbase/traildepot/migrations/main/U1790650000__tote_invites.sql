-- Invitations by email. An invite is matched to the invitee's ACCOUNT email
-- (case-insensitively) by the record-API access rules, so no mail has to be
-- delivered for the flow to work: the invitee sees the invite in-app the next
-- time they sign in, and accepting it is what the tote_members CREATE rule
-- newly allows. Actually notifying them by email is the inviter's mail
-- client's job (a prefilled mailto with the join link).

CREATE TABLE tote_invites (
    id         BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
    tote_id    BLOB NOT NULL REFERENCES totes(id) ON DELETE CASCADE,
    -- The invited address, stored lowercased by the client.
    email      TEXT NOT NULL CHECK(email LIKE '%_@_%'),
    created_by BLOB REFERENCES _user(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL DEFAULT (UNIXEPOCH()),
    UNIQUE(tote_id, email COLLATE NOCASE)
) STRICT;

CREATE INDEX tote_invites_email_idx ON tote_invites (email COLLATE NOCASE);
