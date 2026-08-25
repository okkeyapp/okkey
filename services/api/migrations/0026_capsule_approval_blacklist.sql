-- Soft deny allows a new approval request later.
-- Blacklist permanently blocks by email (authenticated) or IP (guest).
DROP INDEX IF EXISTS capsule_view_requests_denied_user_unique_idx;
DROP INDEX IF EXISTS capsule_view_requests_denied_guest_unique_idx;

CREATE TABLE IF NOT EXISTS capsule_approval_blacklist (
  id bigint PRIMARY KEY,
  capsule_id bigint NOT NULL REFERENCES capsules(id) ON DELETE CASCADE,
  requester_email_hash text,
  ip_address inet,
  created_by bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT capsule_approval_blacklist_identity_chk CHECK (
    (requester_email_hash IS NOT NULL AND ip_address IS NULL)
    OR (requester_email_hash IS NULL AND ip_address IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS capsule_approval_blacklist_email_unique_idx
  ON capsule_approval_blacklist(capsule_id, requester_email_hash)
  WHERE requester_email_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS capsule_approval_blacklist_ip_unique_idx
  ON capsule_approval_blacklist(capsule_id, ip_address)
  WHERE ip_address IS NOT NULL;
