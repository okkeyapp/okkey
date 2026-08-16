-- Owner-managed zero-knowledge capsules with lifecycle and approval requests.

ALTER TABLE capsules
  ADD COLUMN IF NOT EXISTS encrypted_metadata bytea,
  ADD COLUMN IF NOT EXISTS owner_key_wrap bytea,
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS activate_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivate_at timestamptz,
  ADD COLUMN IF NOT EXISTS delete_at timestamptz,
  ADD COLUMN IF NOT EXISTS view_limit_action text NOT NULL DEFAULT 'deactivate',
  ADD COLUMN IF NOT EXISTS password_attempt_limit integer,
  ADD COLUMN IF NOT EXISTS approval_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

UPDATE capsules
SET
  type = CASE WHEN type = 'field' THEN 'text' ELSE type END,
  deactivate_at = COALESCE(deactivate_at, expires_at)
WHERE type = 'field' OR (expires_at IS NOT NULL AND deactivate_at IS NULL);

ALTER TABLE capsule_files
  DROP CONSTRAINT IF EXISTS capsule_files_capsule_id_key;

ALTER TABLE capsule_files
  ADD COLUMN IF NOT EXISTS asset_id text,
  ADD COLUMN IF NOT EXISTS file_name_ciphertext bytea;

UPDATE capsule_files SET asset_id = id::text WHERE asset_id IS NULL;
ALTER TABLE capsule_files ALTER COLUMN asset_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS capsule_files_capsule_asset_idx
  ON capsule_files(capsule_id, asset_id);

CREATE INDEX IF NOT EXISTS capsules_creator_workspace_created_idx
  ON capsules(creator_id, workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS capsules_due_delete_idx
  ON capsules(delete_at) WHERE delete_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS capsule_view_requests (
  id bigint PRIMARY KEY,
  capsule_id bigint NOT NULL REFERENCES capsules(id) ON DELETE CASCADE,
  requester_user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_email_hash text NOT NULL,
  requester_email text NOT NULL,
  requester_name text,
  device_label text NOT NULL DEFAULT 'Unknown device',
  platform text NOT NULL DEFAULT 'Unknown',
  ip_address inet,
  country text,
  city text,
  status text NOT NULL DEFAULT 'pending',
  approval_token_hash text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  consumed_at timestamptz
);

ALTER TABLE capsule_view_requests
  DROP CONSTRAINT IF EXISTS capsule_view_requests_capsule_id_requester_user_id_status_key;
CREATE UNIQUE INDEX IF NOT EXISTS capsule_view_requests_active_unique_idx
  ON capsule_view_requests(capsule_id, requester_user_id)
  WHERE status IN ('pending', 'approved');
CREATE UNIQUE INDEX IF NOT EXISTS capsule_view_requests_denied_unique_idx
  ON capsule_view_requests(capsule_id, requester_user_id)
  WHERE status = 'denied';
CREATE INDEX IF NOT EXISTS capsule_view_requests_owner_pending_idx
  ON capsule_view_requests(capsule_id, requested_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS capsule_view_requests_requester_idx
  ON capsule_view_requests(requester_user_id, requested_at DESC);
