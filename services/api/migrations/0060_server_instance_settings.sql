-- Self-host instance settings (registration mode, setup completion).
-- Singleton row; SaaS ignores these endpoints.
CREATE TABLE IF NOT EXISTS server_instance_settings (
  id boolean PRIMARY KEY DEFAULT TRUE CHECK (id),
  registration_mode text NOT NULL DEFAULT 'open'
    CHECK (registration_mode IN ('open', 'invite_only')),
  setup_completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO server_instance_settings (id)
VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;
