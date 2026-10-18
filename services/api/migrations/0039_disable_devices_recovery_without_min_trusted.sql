-- Trusted-devices recovery requires ≥2 trusted devices (one of them current when enabling).
-- Turn the method off for accounts that still have it on with fewer than two trusted devices
-- (defaults from enrollment / pre-gate settings patches).

UPDATE user_recovery_settings AS urs
SET
  devices_enabled = false,
  updated_at = now()
WHERE urs.devices_enabled = true
  AND (
    SELECT COUNT(*)::int
    FROM devices AS d
    WHERE d.user_id = urs.user_id
      AND d.status = 'trusted'
  ) < 2;
