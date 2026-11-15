export const SMTP_TLS_MODES = ["none", "starttls", "tls"] as const;

export type SmtpTlsMode = (typeof SMTP_TLS_MODES)[number];

/**
 * Values the mailer reads at send time. After env seed, these come from the database only.
 * `useSmtpTransport` is true only when SMTP is verified and a host is configured.
 */
export type MailDeliverySnapshot = {
  smtpHost: string;
  smtpPort: number;
  smtpTlsMode: SmtpTlsMode;
  smtpUsername: string;
  smtpPassword: string;
  emailFrom: string;
  publicAppBaseUrl: string;
  /** True when a usable password is stored in the database. */
  passwordSet: boolean;
  /**
   * True when a stored ciphertext exists but cannot be opened with the current server secret.
   */
  passwordUnreadable: boolean;
  /**
   * Send through SMTP instead of the process email provider.
   * True only when settings are verified and a host is set.
   */
  useSmtpTransport: boolean;
};

export type ServerMailSettingsRow = {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpTlsMode: SmtpTlsMode | null;
  smtpUsername: string | null;
  smtpPasswordCiphertext: Buffer | null;
  emailFrom: string | null;
  publicAppUrl: string | null;
  /** Null until a successful test email marks SMTP active. */
  smtpVerifiedAt: string | null;
  /**
   * Null on the empty singleton insert — triggers a one-time seed from environment.
   * After seed or any write, always set (never re-seed from env).
   */
  updatedBy: string | null;
};

/**
 * Values shown/edited in Mail settings. Empty/null means cleared in the database
 * (no environment merge after the initial seed).
 */
export type ServerMailSettingsPublic = {
  smtpHost: string;
  smtpPort: number | null;
  smtpTlsMode: SmtpTlsMode | null;
  smtpUsername: string;
  emailFrom: string;
  publicAppUrl: string;
  /** True when a decryptable password is stored in the database. */
  passwordSet: boolean;
  passwordUnreadable: boolean;
  /** True when SMTP was verified by a successful test and is used for outbound mail. */
  smtpActive: boolean;
  smtpVerifiedAt: string | null;
};

export type ServerMailSettingsPatch = {
  smtpHost?: string | null;
  smtpPort?: number | string | null;
  smtpTlsMode?: SmtpTlsMode | null;
  smtpUsername?: string | null;
  emailFrom?: string | null;
  publicAppUrl?: string | null;
  /** Non-empty replaces the stored password. Empty or omitted keeps it. */
  password?: string;
  /** Drop the stored password. */
  clearPassword?: boolean;
};

export interface ServerMailSettingsStore {
  read(): Promise<ServerMailSettingsRow | null>;
  write(row: ServerMailSettingsRow, updatedBy: string): Promise<void>;
}
