CREATE TABLE IF NOT EXISTS system_update_dismissals (
  component text PRIMARY KEY,
  dismissed_version text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now()
);
