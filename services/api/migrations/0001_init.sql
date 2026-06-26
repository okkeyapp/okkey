-- Okkey Core initial schema (snowflake bigint entity ids)

CREATE TABLE users (
  id bigint PRIMARY KEY,
  email text NOT NULL UNIQUE,
  public_key text NOT NULL,
  public_pq_key text,
  encrypted_private_key bytea NOT NULL,
  server_key_share bytea NOT NULL,
  password_kdf_salt bytea,
  password_kdf_params_version smallint,
  locale text,
  two_factor_enabled_at timestamptz,
  first_name text,
  last_name text,
  vault_idle_lock_seconds integer NOT NULL DEFAULT 900,
  billing_region text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_vault_idle_lock_seconds_check CHECK (
    vault_idle_lock_seconds >= 60 AND vault_idle_lock_seconds <= 86400
  )
);

COMMENT ON COLUMN users.public_key IS 'Ed25519 public key (32 bytes), standard base64';
COMMENT ON COLUMN users.public_pq_key IS 'ML-KEM-768 encapsulation key (1184 bytes), standard base64; null for legacy accounts';
COMMENT ON COLUMN users.password_kdf_salt IS 'Argon2id salt for password share C (never send master password to server)';
COMMENT ON COLUMN users.password_kdf_params_version IS 'KDF parameter set version (1 = m=19456 t=2 p=1)';
COMMENT ON COLUMN users.locale IS 'Preferred language for emails/UI (en, ru); null = not set';
COMMENT ON COLUMN users.billing_region IS 'Preferred billing region (ISO 3166-1 alpha-2); null = derive from client/browser default';

CREATE TABLE workspaces (
  id bigint PRIMARY KEY,
  name text NOT NULL,
  owner_id bigint NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  plan_tier text NOT NULL DEFAULT 'FREE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id bigint PRIMARY KEY,
  workspace_id bigint NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  permissions_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE profiles (
  id bigint PRIMARY KEY,
  workspace_id bigint NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  permissions_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE workspace_members (
  id bigint PRIMARY KEY,
  workspace_id bigint NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id bigint REFERENCES roles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE devices (
  id bigint PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_fingerprint text NOT NULL,
  device_name text NOT NULL,
  device_public_key text NOT NULL,
  device_share bytea NOT NULL,
  platform text NOT NULL,
  os_name text NOT NULL,
  os_version text NOT NULL,
  app_version text NOT NULL,
  client_type text NOT NULL,
  user_agent text NOT NULL,
  ip_first text NOT NULL,
  ip_last text NOT NULL,
  status text NOT NULL CHECK (status IN ('trusted', 'pending', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  approved_by bigint REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  revoked_at timestamptz,
  UNIQUE (user_id, device_fingerprint, device_public_key)
);

CREATE TABLE sessions (
  id bigint PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id bigint REFERENCES devices(id) ON DELETE SET NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_sessions_token_hash ON sessions(token_hash);

CREATE TABLE vaults (
  id bigint PRIMARY KEY,
  workspace_id bigint NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_personal boolean NOT NULL DEFAULT false,
  owner_id bigint REFERENCES users(id) ON DELETE SET NULL,
  crypto_version smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vaults_crypto_version_check CHECK (crypto_version >= 1 AND crypto_version <= 65535)
);

CREATE TABLE vault_members (
  id bigint PRIMARY KEY,
  vault_id bigint NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vault_id, user_id)
);

CREATE TABLE vault_profiles (
  id bigint PRIMARY KEY,
  vault_id bigint NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id bigint REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vault_id, user_id)
);

CREATE TABLE vault_keys (
  id bigint PRIMARY KEY,
  vault_id bigint NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_vault_key bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vault_id, user_id)
);

CREATE TABLE items (
  id bigint PRIMARY KEY,
  vault_id bigint NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  encrypted_data bytea NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE capsules (
  id bigint PRIMARY KEY,
  workspace_id bigint NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  creator_id bigint REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL,
  encrypted_payload bytea NOT NULL,
  access_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  view_limit integer,
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE capsule_files (
  id bigint PRIMARY KEY,
  capsule_id bigint NOT NULL UNIQUE REFERENCES capsules(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id bigint PRIMARY KEY,
  vault_id bigint NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  actor_id bigint REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  encrypted_payload bytea NOT NULL,
  version integer NOT NULL DEFAULT 1,
  payload_schema_version integer NOT NULL DEFAULT 1,
  idempotency_key bigint,
  client_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_events_vault_idempotency ON events (vault_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE attachments (
  id bigint PRIMARY KEY,
  vault_id bigint NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  item_id bigint REFERENCES items(id) ON DELETE SET NULL,
  storage_key text NOT NULL,
  encrypted_key bytea NOT NULL,
  size bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_totp_credentials (
  user_id bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_secret bytea NOT NULL,
  algorithm text NOT NULL DEFAULT 'SHA1',
  period_seconds integer NOT NULL DEFAULT 30,
  digits integer NOT NULL DEFAULT 6,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_backup_codes (
  id bigint PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace_member_item_category_preferences (
  id bigint PRIMARY KEY,
  workspace_id bigint NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  favorite_category_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_user_id_status ON devices(user_id, status);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_workspaces_owner_id ON workspaces(owner_id);
CREATE INDEX idx_workspace_members_workspace_id ON workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_user_id ON workspace_members(user_id);
CREATE INDEX idx_vaults_workspace_id ON vaults(workspace_id);
CREATE INDEX idx_vault_members_vault_id ON vault_members(vault_id);
CREATE INDEX idx_vault_members_user_id ON vault_members(user_id);
CREATE INDEX idx_vault_profiles_vault_id ON vault_profiles(vault_id);
CREATE INDEX idx_vault_profiles_user_id ON vault_profiles(user_id);
CREATE INDEX idx_vault_keys_vault_id ON vault_keys(vault_id);
CREATE INDEX idx_vault_keys_user_id ON vault_keys(user_id);
CREATE INDEX idx_items_vault_id ON items(vault_id);
CREATE INDEX idx_events_vault_id ON events(vault_id);
CREATE INDEX idx_events_created_at ON events(created_at);
CREATE INDEX idx_attachments_vault_id ON attachments(vault_id);
CREATE INDEX idx_capsule_files_capsule_id ON capsule_files(capsule_id);
CREATE INDEX idx_user_backup_codes_user_id ON user_backup_codes(user_id);
CREATE INDEX idx_user_backup_codes_user_unused ON user_backup_codes(user_id) WHERE used_at IS NULL;
CREATE INDEX workspace_member_item_category_preferences_workspace_user_idx
  ON workspace_member_item_category_preferences (workspace_id, user_id);
