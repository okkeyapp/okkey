-- Drop stored shares for devices that are no longer active.
-- Revoked and rejected rows are cleared here. A pending row whose approval
-- window has already elapsed is cleared by the startup backfill, which knows
-- the configured approval TTL. Active rows are left for that backfill: a raw
-- share is re-wrapped when the device wrap public keys are available, and
-- cleared otherwise so the client can upload an envelope.

UPDATE devices
SET device_share = NULL
WHERE device_share IS NOT NULL
  AND (
    status = 'revoked'
    OR rejected_at IS NOT NULL
    OR revoked_at IS NOT NULL
    OR rejection_reason = 'approval expired'
  );
