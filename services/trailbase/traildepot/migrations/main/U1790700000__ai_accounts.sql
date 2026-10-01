-- One Open WebUI identity per Tote user, provisioned lazily by the web server
-- on the first AI call. The api_key is the per-user Open WebUI key every
-- transcribe/classify request is sent with, so usage is attributed per user;
-- the password is kept so the account can log into the Open WebUI UI later or
-- rotate its key. This table has no browser-facing access: its record API is
-- restricted to the service account (see config.textproto).
CREATE TABLE ai_accounts (
    id                 BLOB PRIMARY KEY NOT NULL CHECK(is_uuid_v7(id)) DEFAULT (uuid_v7()),
    user_id            BLOB NOT NULL UNIQUE REFERENCES _user(id) ON DELETE CASCADE,
    openwebui_user_id  TEXT NOT NULL,
    openwebui_email    TEXT NOT NULL,
    openwebui_password TEXT NOT NULL,
    api_key            TEXT NOT NULL,
    created_at         INTEGER NOT NULL DEFAULT (UNIXEPOCH())
) STRICT;
