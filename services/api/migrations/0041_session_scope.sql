-- Optional session scope: NULL = full Bearer session; non-null = limited capability.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS scope text NULL;

COMMENT ON COLUMN sessions.scope IS
  'NULL = full session. registration_recovery = post-register recovery key enroll/ack only.';
