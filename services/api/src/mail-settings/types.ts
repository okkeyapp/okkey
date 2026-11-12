export const SMTP_TLS_MODES = ["none", "starttls", "tls"] as const;

export type SmtpTlsMode = (typeof SMTP_TLS_MODES)[number];

/** Values the mailer reads at send time. Missing database fields are already filled from the environment. */
export type MailDeliverySnapshot = {
  smtpHost: string;
  smtpPort: number;
  smtpTlsMode: SmtpTlsMode;
  smtpUsername: string;
  smtpPassword: string;
  emailFrom: string;
  publicAppBaseUrl: string;
  /** True when a password is configured (database ciphertext or environment). */
  passwordSet: boolean;
  /**
   * Send through SMTP instead of the process email provider.
   * True when `EMAIL_PROVIDER=smtp` or the database stores an SMTP host.
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
};

export type ServerMailSettingsPublic = {
  smtpHost: string;
  smtpPort: number;
  smtpTlsMode: SmtpTlsMode;
  smtpUsername: string;
  emailFrom: string;
  publicAppUrl: string;
  passwordSet: boolean;
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
  /** Drop the stored password so the environment value is used again. */
  clearPassword?: boolean;
};

export interface ServerMailSettingsStore {
  read(): Promise<ServerMailSettingsRow | null>;
  write(row: ServerMailSettingsRow, updatedBy: string): Promise<void>;
}
