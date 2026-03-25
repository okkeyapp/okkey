CREATE TABLE IF NOT EXISTS capsule_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capsule_id uuid NOT NULL UNIQUE REFERENCES capsules(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capsule_files_capsule_id ON capsule_files(capsule_id);
