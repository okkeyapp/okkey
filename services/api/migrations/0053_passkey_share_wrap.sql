-- WebAuthn PRF wrap of share B, and how a device row became trusted.
-- share_wrap is AEAD ciphertext. The API cannot decrypt it and must not copy
-- another row's device_share when a passkey approves a device.

ALTER TABLE user_webauthn_credentials
  ADD COLUMN IF NOT EXISTS share_wrap bytea,
  ADD COLUMN IF NOT EXISTS share_wrap_salt bytea,
  ADD COLUMN IF NOT EXISTS share_wrap_version integer;

ALTER TABLE user_webauthn_credentials
  DROP CONSTRAINT IF EXISTS user_webauthn_credentials_share_wrap_check;

ALTER TABLE user_webauthn_credentials
  ADD CONSTRAINT user_webauthn_credentials_share_wrap_check
  CHECK (
    (
      share_wrap IS NULL
      AND share_wrap_salt IS NULL
      AND share_wrap_version IS NULL
    )
    OR (
      share_wrap IS NOT NULL
      AND share_wrap_salt IS NOT NULL
      AND octet_length(share_wrap) BETWEEN 41 AND 4137
      AND octet_length(share_wrap_salt) = 32
      AND share_wrap_version = 1
      AND get_byte(share_wrap, 0) = 1
    )
  );

COMMENT ON COLUMN user_webauthn_credentials.share_wrap IS
  'Versioned AEAD ciphertext of share B under a WebAuthn PRF output. The server cannot open it.';

COMMENT ON COLUMN user_webauthn_credentials.share_wrap_salt IS
  '32-byte salt passed to PRF eval and mixed into the wrap key. Not the PRF output.';

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS approval_method text;

ALTER TABLE devices
  DROP CONSTRAINT IF EXISTS devices_approval_method_check;

ALTER TABLE devices
  ADD CONSTRAINT devices_approval_method_check
  CHECK (approval_method IS NULL OR approval_method IN ('device', 'passkey'));

COMMENT ON COLUMN devices.approval_method IS
  'device: trusted approver. passkey: pending device submitted share B after a PRF unwrap. NULL if trusted before this column.';
