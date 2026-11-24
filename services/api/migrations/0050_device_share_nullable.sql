-- Revoked, rejected, and expired device rows clear the stored share.
ALTER TABLE devices ALTER COLUMN device_share DROP NOT NULL;
