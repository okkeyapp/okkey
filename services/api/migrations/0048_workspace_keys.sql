-- Versioned workspace key wraps, encrypted logo, and encrypted client settings.
-- The server stores ciphertext only. Attachments stay on vault keys.

CREATE TABLE workspace_key_wraps (
  workspace_id bigint NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key_version integer NOT NULL CHECK (key_version >= 1),
  encrypted_workspace_key bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id, key_version)
);

CREATE INDEX workspace_key_wraps_workspace_version_idx
  ON workspace_key_wraps (workspace_id, key_version);

CREATE TABLE workspace_logos (
  workspace_id bigint PRIMARY KEY REFERENCES workspaces (id) ON DELETE CASCADE,
  key_version integer NOT NULL CHECK (key_version >= 1),
  ciphertext bytea NOT NULL,
  ciphertext_bytes integer NOT NULL CHECK (ciphertext_bytes >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workspaces
  ADD COLUMN logo_key_version integer,
  ADD COLUMN logo_updated_at timestamptz,
  ADD COLUMN client_settings_key_version integer,
  ADD COLUMN client_settings_ciphertext bytea;
