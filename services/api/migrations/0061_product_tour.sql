-- Per-user first-sign-in product tour progress (web).
-- Existing accounts are marked completed so the tour only runs for new sign-ups.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS product_tour_completed boolean NOT NULL DEFAULT false;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS product_tour_step smallint NOT NULL DEFAULT 1;

COMMENT ON COLUMN users.product_tour_completed IS
  'When true, the first-sign-in product tour will not be shown again.';

COMMENT ON COLUMN users.product_tour_step IS
  'Current product tour step (1–4) while product_tour_completed is false.';

-- Existing users: never show the tour retroactively.
UPDATE users
SET product_tour_completed = true
WHERE product_tour_completed IS NOT TRUE;
