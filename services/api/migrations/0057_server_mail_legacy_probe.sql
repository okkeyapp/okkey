-- One-time upgrade check for SMTP saved before verification was required.
-- NULL means the row has not been probed and was not written by the new mail settings flow.
ALTER TABLE server_mail_settings
  ADD COLUMN IF NOT EXISTS smtp_legacy_probed_at timestamptz;
