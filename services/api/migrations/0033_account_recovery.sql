-- Account recovery: vault key wrap, method prefs, trusted contacts.
-- User FK columns are bigint to match users.id (see 0001_init / 0030_user_webauthn_login).

CREATE TABLE IF NOT EXISTS user_vault_recovery_wrap (
  user_id bigint PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  encrypted_blob jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  exported_at timestamptz
);

CREATE TABLE IF NOT EXISTS user_recovery_settings (
  user_id bigint PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  key_enabled boolean NOT NULL DEFAULT true,
  devices_enabled boolean NOT NULL DEFAULT false,
  contacts_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_trusted_contacts (
  id bigint PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  contact_email text NOT NULL,
  contact_user_id bigint REFERENCES users (id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('pending', 'confirmed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  UNIQUE (user_id, contact_email)
);

CREATE INDEX IF NOT EXISTS idx_user_trusted_contacts_user_id
  ON user_trusted_contacts (user_id);

CREATE INDEX IF NOT EXISTS idx_user_trusted_contacts_contact_user_id
  ON user_trusted_contacts (contact_user_id)
  WHERE contact_user_id IS NOT NULL AND status = 'pending';
