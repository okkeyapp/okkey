-- Last feed version a signed-in user opened in the system-update popup.
-- dismissed_version stays the Ignore action. seen_version only clears the sidebar dot.
ALTER TABLE system_update_dismissals
  ADD COLUMN IF NOT EXISTS seen_version text;

ALTER TABLE system_update_dismissals
  ALTER COLUMN dismissed_version DROP NOT NULL;
