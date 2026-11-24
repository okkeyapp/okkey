-- Interactive Mail settings: track whether SMTP was verified by a successful test send.
-- updated_by NULL means the singleton row was never seeded/written — API seeds from env once.
ALTER TABLE server_mail_settings
  ADD COLUMN IF NOT EXISTS smtp_verified_at timestamptz;
