-- Optional display names (non-crypto); used to restore UI after local storage was cleared.

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name text;
