-- Workspace-level monitoring card visibility / feature toggles (JSON object).

ALTER TABLE workspaces
  ADD COLUMN monitoring_card_settings jsonb NOT NULL DEFAULT '{
    "enabled_cards": {
      "overall": true,
      "strength": true,
      "reused": true,
      "weak": true,
      "compromised": true,
      "stale": true,
      "passkeyGap": true,
      "twoFactorGap": true
    }
  }'::jsonb;

COMMENT ON COLUMN workspaces.monitoring_card_settings IS
  'Admin toggles for monitoring dashboard cards: visibility and related analytics/network.';
