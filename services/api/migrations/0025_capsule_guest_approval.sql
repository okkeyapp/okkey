-- Guest approval requests (Access off + Approval on): no authenticated user required.
ALTER TABLE capsule_view_requests
  ALTER COLUMN requester_user_id DROP NOT NULL;

ALTER TABLE capsule_view_requests
  ADD COLUMN IF NOT EXISTS guest_session_id text;

DROP INDEX IF EXISTS capsule_view_requests_active_unique_idx;
DROP INDEX IF EXISTS capsule_view_requests_denied_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS capsule_view_requests_active_user_unique_idx
  ON capsule_view_requests(capsule_id, requester_user_id)
  WHERE status IN ('pending', 'approved') AND requester_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS capsule_view_requests_denied_user_unique_idx
  ON capsule_view_requests(capsule_id, requester_user_id)
  WHERE status = 'denied' AND requester_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS capsule_view_requests_active_guest_unique_idx
  ON capsule_view_requests(capsule_id, guest_session_id)
  WHERE status IN ('pending', 'approved') AND guest_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS capsule_view_requests_denied_guest_unique_idx
  ON capsule_view_requests(capsule_id, guest_session_id)
  WHERE status = 'denied' AND guest_session_id IS NOT NULL;
