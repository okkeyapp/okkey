CREATE TABLE workspace_personal_events (
  id bigint PRIMARY KEY,
  workspace_id bigint NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  encrypted_payload bytea NOT NULL,
  version integer NOT NULL,
  payload_schema_version integer NOT NULL DEFAULT 2,
  idempotency_key bigint,
  client_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id, version)
);

CREATE UNIQUE INDEX idx_workspace_personal_events_idempotency
  ON workspace_personal_events (workspace_id, user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_workspace_personal_events_workspace_user
  ON workspace_personal_events (workspace_id, user_id);
