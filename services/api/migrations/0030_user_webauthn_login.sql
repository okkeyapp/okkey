-- Account WebAuthn login credentials (passkey + hardware key) and preferred primary method.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS primary_login_method text NOT NULL DEFAULT 'email';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_primary_login_method_check;

ALTER TABLE users
  ADD CONSTRAINT users_primary_login_method_check
  CHECK (primary_login_method IN ('email', 'passkey', 'hardware_key'));

COMMENT ON COLUMN users.primary_login_method IS
  'Preferred first-factor login method shown at auth: email | passkey | hardware_key';

CREATE TABLE IF NOT EXISTS user_webauthn_credentials (
  id bigint PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id text NOT NULL,
  public_key bytea NOT NULL,
  sign_count bigint NOT NULL DEFAULT 0,
  transports jsonb NOT NULL DEFAULT '[]'::jsonb,
  authenticator_attachment text NOT NULL,
  aaguid text,
  name text NOT NULL DEFAULT '',
  backed_up boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  CONSTRAINT user_webauthn_credentials_attachment_check
    CHECK (authenticator_attachment IN ('platform', 'cross-platform')),
  CONSTRAINT user_webauthn_credentials_credential_id_unique UNIQUE (credential_id)
);

CREATE INDEX IF NOT EXISTS user_webauthn_credentials_user_id_idx
  ON user_webauthn_credentials (user_id);

CREATE INDEX IF NOT EXISTS user_webauthn_credentials_user_attachment_idx
  ON user_webauthn_credentials (user_id, authenticator_attachment);

COMMENT ON TABLE user_webauthn_credentials IS
  'WebAuthn credentials for account login; platform = passkey, cross-platform = hardware key';
