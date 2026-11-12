-- Server-wide SMTP and public app URL. NULL columns fall back to environment variables.
-- The SMTP password is AES-256-GCM ciphertext (server key), never a workspace-key blob.
CREATE TABLE IF NOT EXISTS server_mail_settings (
  id boolean PRIMARY KEY DEFAULT TRUE CHECK (id),
  smtp_host text,
  smtp_port integer,
  smtp_tls_mode text,
  smtp_username text,
  smtp_password_ciphertext bytea,
  email_from text,
  public_app_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  CONSTRAINT server_mail_settings_port_check
    CHECK (smtp_port IS NULL OR (smtp_port >= 1 AND smtp_port <= 65535)),
  CONSTRAINT server_mail_settings_tls_mode_check
    CHECK (
      smtp_tls_mode IS NULL
      OR smtp_tls_mode IN ('none', 'starttls', 'tls')
    )
);

INSERT INTO server_mail_settings (id)
VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;
