-- Optional UI / email locale (BCP 47 base language: en, ru). Null = use Accept-Language / instance default.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS locale text NULL;

COMMENT ON COLUMN users.locale IS 'Preferred language for emails/UI (en, ru); null = not set';
