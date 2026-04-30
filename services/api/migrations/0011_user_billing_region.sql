-- Optional billing region (ISO 3166-1 alpha-2). Used later for invoices and payment localization.

ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_region text;

COMMENT ON COLUMN users.billing_region IS 'Preferred billing region (ISO 3166-1 alpha-2); null = derive from client/browser default';
