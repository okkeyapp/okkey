-- Timed / permanent device blocks from "Not now" approval menu.
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_status_check;
ALTER TABLE devices
  ADD CONSTRAINT devices_status_check
  CHECK (status IN ('trusted', 'pending', 'revoked', 'blocked'));

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS blocked_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_devices_user_id_blocked
  ON devices (user_id, status)
  WHERE status = 'blocked';
