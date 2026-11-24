-- Short-lived credential for a pending device to read its approval status
-- after the vault session is revoked. Only the token hash is stored.
CREATE TABLE IF NOT EXISTS device_approval_status_tokens (
  token_hash text PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id bigint NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  request_created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_approval_status_tokens_device
  ON device_approval_status_tokens (user_id, device_id);
