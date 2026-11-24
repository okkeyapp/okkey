-- One-time public keys and the hybrid envelope used to deliver share B.
-- The envelope is deleted when the new device confirms receipt, or when it expires unclaimed.
-- devices.device_share itself is unchanged.

ALTER TABLE devices
  ADD COLUMN one_time_x25519_public bytea,
  ADD COLUMN one_time_mlkem_public bytea,
  ADD COLUMN share_delivery_envelope bytea,
  ADD COLUMN share_delivery_expires_at timestamptz;
