import type { ServerMailSettingsResponseDto, SmtpTlsMode } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsFieldRow,
} from "@okkey/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useAuthenticatedCoreClient } from "../../../auth/AuthVaultContext";
import { runSaveWithToast } from "../../../lib/saveWithToast";

type ServerMailSettingsBlockProps = {
  workspaceId: string;
  t: (messageKey: string, values?: WebMessageValues) => string;
  canPut?: boolean;
};

const TLS_MODES: SmtpTlsMode[] = ["none", "starttls", "tls"];

const SAVE_TOAST = {
  loading: "web.toast.save.loading",
  success: "web.toast.save.success",
  error: "web.toast.save.error",
} as const;

type MailFormState = {
  host: string;
  port: string;
  tlsMode: SmtpTlsMode;
  username: string;
  emailFrom: string;
  publicAppUrl: string;
  passwordSet: boolean;
  passwordUnreadable: boolean;
};

function messageFromError(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "body" in error) {
    const body = (error as { body?: { message?: unknown } }).body;
    if (typeof body?.message === "string" && body.message.trim()) {
      return body.message;
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function formFromSettings(settings: ServerMailSettingsResponseDto): MailFormState {
  return {
    host: settings.smtp_host,
    port: String(settings.smtp_port),
    tlsMode: settings.smtp_tls_mode,
    username: settings.smtp_username,
    emailFrom: settings.email_from,
    publicAppUrl: settings.public_app_url,
    passwordSet: settings.password_set,
    passwordUnreadable: settings.password_unreadable === true,
  };
}

function FieldDivider() {
  return <div className="my-4 border-t border-border" aria-hidden />;
}

export default function ServerMailSettingsBlock({
  workspaceId,
  t,
  canPut = true,
}: ServerMailSettingsBlockProps) {
  const core = useAuthenticatedCoreClient();
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [tlsMode, setTlsMode] = useState<SmtpTlsMode>("starttls");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [publicAppUrl, setPublicAppUrl] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);
  const [passwordUnreadable, setPasswordUnreadable] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const savedRef = useRef<MailFormState | null>(null);

  const applySettings = useCallback((settings: ServerMailSettingsResponseDto) => {
    const next = formFromSettings(settings);
    setHost(next.host);
    setPort(next.port);
    setTlsMode(next.tlsMode);
    setUsername(next.username);
    setEmailFrom(next.emailFrom);
    setPublicAppUrl(next.publicAppUrl);
    setPasswordSet(next.passwordSet);
    setPasswordUnreadable(next.passwordUnreadable);
    setPassword("");
    setEditingPassword(next.passwordUnreadable || !next.passwordSet);
    savedRef.current = next;
  }, []);

  useEffect(() => {
    if (!core || !workspaceId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void core
      .getServerMailSettings(workspaceId)
      .then((settings) => {
        if (!cancelled) {
          applySettings(settings);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(messageFromError(error, t("web.workspaceSettings.serverMail.loadError")));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [applySettings, core, t, workspaceId]);

  useEffect(() => {
    if (editingPassword && passwordInputRef.current) {
      passwordInputRef.current.focus();
    }
  }, [editingPassword]);

  function parsePortValue(value: string): number | null {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : null;
  }

  async function patchSettings(
    patch: Record<string, unknown>,
    options?: { silent?: boolean },
  ): Promise<ServerMailSettingsResponseDto | null> {
    if (!core || !canPut || saving) {
      return null;
    }
    setSaving(true);
    try {
      const run = () => core.updateServerMailSettings(workspaceId, patch);
      const updated = options?.silent
        ? await run()
        : await runSaveWithToast(t, SAVE_TOAST, run);
      applySettings(updated);
      return updated;
    } catch (error: unknown) {
      if (options?.silent) {
        toast.error(messageFromError(error, t("web.workspaceSettings.serverMail.saveError")));
      }
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveFieldIfChanged(
    key: keyof MailFormState,
    value: string | SmtpTlsMode,
    patchKey: string,
    patchValue: unknown,
  ) {
    const saved = savedRef.current;
    if (!saved || saved[key] === value) {
      return;
    }
    if (patchKey === "smtp_port" && patchValue === null) {
      toast.error(t("web.workspaceSettings.serverMail.invalidPort"));
      setPort(saved.port);
      return;
    }
    await patchSettings({ [patchKey]: patchValue });
  }

  async function handlePasswordBlur() {
    if (!canPut) {
      return;
    }
    const trimmed = password.trim();
    if (!trimmed) {
      // Keep the stored password; collapse back to the change button when one exists.
      setPassword("");
      if (passwordSet && !passwordUnreadable) {
        setEditingPassword(false);
      }
      return;
    }
    const updated = await patchSettings({ password: trimmed });
    if (updated) {
      setEditingPassword(false);
    }
  }

  async function handleTestEmail() {
    if (!core || testing || !canPut) {
      return;
    }
    const parsedPort = parsePortValue(port);
    if (parsedPort === null) {
      toast.error(t("web.workspaceSettings.serverMail.invalidPort"));
      return;
    }
    setTesting(true);
    try {
      await core.sendServerMailTestEmail(workspaceId, {
        smtp_host: host.trim(),
        smtp_port: parsedPort,
        smtp_tls_mode: tlsMode,
        smtp_username: username.trim(),
        email_from: emailFrom.trim(),
        public_app_url: publicAppUrl.trim(),
        ...(password.trim() ? { password: password.trim() } : {}),
      });
      toast.success(t("web.workspaceSettings.serverMail.testSuccess"));
    } catch (error: unknown) {
      toast.error(messageFromError(error, t("web.workspaceSettings.serverMail.testError")));
    } finally {
      setTesting(false);
    }
  }

  const busy = saving || testing;
  const showPasswordField = editingPassword || passwordUnreadable || !passwordSet;

  return (
    <section className="flex flex-col gap-6" data-testid="server-mail-settings" aria-labelledby="server-mail-settings-title">
      <div className="flex flex-col gap-4">
        <h2 id="server-mail-settings-title" className="text-lg font-semibold text-foreground">
          {t("web.workspaceSettings.sections.mail")}
        </h2>
        <p className="text-sm leading-5 text-muted-foreground">
          {t("web.workspaceSettings.serverMail.caption")}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.serverMail.loading")}</p>
      ) : loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : (
        <div className="flex flex-col">
          {passwordUnreadable ? (
            <div
              className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              role="status"
              data-testid="server-mail-password-unreadable"
            >
              {t("web.workspaceSettings.serverMail.passwordUnreadable")}
            </div>
          ) : null}

          <SettingsFieldRow
            control={
              <Input
                id="server-mail-host"
                className="w-full shrink-0 sm:w-[250px]"
                value={host}
                autoComplete="off"
                disabled={!canPut || busy}
                onChange={(event) => setHost(event.target.value)}
                onBlur={() => void saveFieldIfChanged("host", host.trim(), "smtp_host", host.trim())}
              />
            }
          >
            <label htmlFor="server-mail-host" className="text-sm font-medium text-foreground">
              {t("web.workspaceSettings.serverMail.smtpHost")}
            </label>
            <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.serverMail.smtpHostDescription")}</p>
          </SettingsFieldRow>

          <FieldDivider />

          <SettingsFieldRow
            control={
              <Input
                id="server-mail-port"
                className="w-full shrink-0 sm:w-[150px]"
                inputMode="numeric"
                value={port}
                disabled={!canPut || busy}
                onChange={(event) => setPort(event.target.value.replace(/[^\d]/g, ""))}
                onBlur={() =>
                  void saveFieldIfChanged("port", port, "smtp_port", parsePortValue(port))
                }
              />
            }
          >
            <label htmlFor="server-mail-port" className="text-sm font-medium text-foreground">
              {t("web.workspaceSettings.serverMail.smtpPort")}
            </label>
            <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.serverMail.smtpPortDescription")}</p>
          </SettingsFieldRow>

          <FieldDivider />

          <SettingsFieldRow
            control={
              <Select
                value={tlsMode}
                disabled={!canPut || busy}
                onValueChange={(value) => {
                  const next = value as SmtpTlsMode;
                  setTlsMode(next);
                  void saveFieldIfChanged("tlsMode", next, "smtp_tls_mode", next);
                }}
              >
                <SelectTrigger id="server-mail-tls" className="h-9 w-full shrink-0 sm:w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TLS_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {t(`web.workspaceSettings.serverMail.tls.${mode}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          >
            <label htmlFor="server-mail-tls" className="text-sm font-medium text-foreground">
              {t("web.workspaceSettings.serverMail.tlsMode")}
            </label>
            <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.serverMail.tlsModeDescription")}</p>
          </SettingsFieldRow>

          <FieldDivider />

          <SettingsFieldRow
            control={
              <Input
                id="server-mail-username"
                className="w-full shrink-0 sm:w-[250px]"
                value={username}
                autoComplete="off"
                disabled={!canPut || busy}
                onChange={(event) => setUsername(event.target.value)}
                onBlur={() =>
                  void saveFieldIfChanged("username", username.trim(), "smtp_username", username.trim())
                }
              />
            }
          >
            <label htmlFor="server-mail-username" className="text-sm font-medium text-foreground">
              {t("web.workspaceSettings.serverMail.username")}
            </label>
            <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.serverMail.usernameDescription")}</p>
          </SettingsFieldRow>

          <FieldDivider />

          <SettingsFieldRow
            control={
              showPasswordField ? (
                <Input
                  ref={passwordInputRef}
                  id="server-mail-password"
                  type="password"
                  className="w-full shrink-0 sm:w-[250px]"
                  value={password}
                  autoComplete="new-password"
                  disabled={!canPut || busy}
                  onChange={(event) => setPassword(event.target.value)}
                  onBlur={() => void handlePasswordBlur()}
                />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 px-3"
                  disabled={!canPut || busy}
                  data-testid="server-mail-change-password"
                  onClick={() => {
                    setPassword("");
                    setEditingPassword(true);
                  }}
                >
                  {t("web.workspaceSettings.serverMail.changePassword")}
                </Button>
              )
            }
          >
            <label htmlFor="server-mail-password" className="text-sm font-medium text-foreground">
              {t("web.workspaceSettings.serverMail.password")}
            </label>
            <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.serverMail.passwordDescription")}</p>
          </SettingsFieldRow>

          <FieldDivider />

          <SettingsFieldRow
            control={
              <Input
                id="server-mail-from"
                type="email"
                className="w-full shrink-0 sm:w-[250px]"
                value={emailFrom}
                autoComplete="off"
                disabled={!canPut || busy}
                onChange={(event) => setEmailFrom(event.target.value)}
                onBlur={() =>
                  void saveFieldIfChanged("emailFrom", emailFrom.trim(), "email_from", emailFrom.trim())
                }
              />
            }
          >
            <label htmlFor="server-mail-from" className="text-sm font-medium text-foreground">
              {t("web.workspaceSettings.serverMail.emailFrom")}
            </label>
            <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.serverMail.emailFromDescription")}</p>
          </SettingsFieldRow>

          <FieldDivider />

          <SettingsFieldRow
            control={
              <Input
                id="server-mail-public-url"
                type="url"
                className="w-full shrink-0 sm:w-[250px]"
                value={publicAppUrl}
                autoComplete="off"
                disabled={!canPut || busy}
                onChange={(event) => setPublicAppUrl(event.target.value)}
                onBlur={() =>
                  void saveFieldIfChanged(
                    "publicAppUrl",
                    publicAppUrl.trim(),
                    "public_app_url",
                    publicAppUrl.trim(),
                  )
                }
              />
            }
          >
            <label htmlFor="server-mail-public-url" className="text-sm font-medium text-foreground">
              {t("web.workspaceSettings.serverMail.publicAppUrl")}
            </label>
            <p className="text-sm text-muted-foreground">
              {t("web.workspaceSettings.serverMail.publicAppUrlDescription")}
            </p>
          </SettingsFieldRow>

          {canPut ? (
            <div className="mt-8 flex flex-col items-start gap-3">
              <Button
                type="button"
                className="h-9 px-3"
                disabled={busy}
                data-testid="server-mail-test"
                onClick={() => void handleTestEmail()}
              >
                {testing
                  ? t("web.workspaceSettings.serverMail.testing")
                  : t("web.workspaceSettings.serverMail.test")}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
