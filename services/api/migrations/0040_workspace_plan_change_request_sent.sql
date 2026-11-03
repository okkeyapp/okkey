-- One-shot license / plan-change sales request per workspace (no resend after success).

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS plan_change_request_sent_at timestamptz NULL;

COMMENT ON COLUMN workspaces.plan_change_request_sent_at IS
  'Set when a plan-change / license purchase request email was successfully sent to sales; blocks further submits.';
