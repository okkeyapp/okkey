import type { ServerMailSettingsResponseDto, SmtpTlsMode } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsFieldRow,
} from "@okkey/ui";
import { IconDelete16 } from "@okkey/vault-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const TEST_EMAIL_TIMEOUT_SECONDS = 30;
const TEST_EMAIL_CLIENT_TIMEOUT_MS = TEST_EMAIL_TIMEOUT_SECONDS * 1000 + 1_500;

type FormSnapshot = {
  host: string;
  port: string;
  tlsMode: SmtpTlsMode;
  username: string;
  emailFrom: string;
  publicAppUrl: string;
  passwordSet: boolean;
  clearPassword: boolean;
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

function formFromSettings(settings: ServerMailSettingsResponseDto): FormSnapshot {
  return {
    host: settings.smtp_host ?? "",
    port: settings.smtp_port == null ? "" : String(settings.smtp_port),
    tlsMode: settings.smtp_tls_mode ?? "starttls",
    username: settings.smtp_username ?? "",
    emailFrom: settings.email_from ?? "",
    publicAppUrl: settings.public_app_url ?? "",
    passwordSet: settings.password_set,
    clearPassword: false,
  };
}

function FieldDivider() {
  return <div className="my-4 border-t border-border" aria-hidden />;
}

function buildPatch(
  form: FormSnapshot,
  password: string,
): Record<string, unknown> {
  const trimmedPort = form.port.trim();
  const parsedPort = trimmedPort ? Number(trimmedPort) : null;
  return {
    smtp_host: form.host.trim(),
    smtp_port:
      trimmedPort && Number.isInteger(parsedPort) && parsedPort! >= 1 && parsedPort! <= 65535
        ? parsedPort
        : trimmedPort
          ? null
          : null,
    smtp_tls_mode: form.tlsMode,
    smtp_username: form.username.trim(),
    email_from: form.emailFrom.trim(),
    public_app_url: form.publicAppUrl.trim(),
    ...(form.clearPassword
      ? { clear_password: true }
      : password.trim()
        ? { password: password.trim() }
        : {}),
  };
}

export default function ServerMailSettingsBlock({
  workspaceId,
  t,
  canPut = true,
}: ServerMailSettingsBlockProps) {
  const core = useAuthenticatedCoreClient();
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const focusPasswordOnOpenRef = useRef(false);
  const loadGenerationRef = useRef(0);
  const tRef = useRef(t);
  tRef.current = t;
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testSecondsLeft, setTestSecondsLeft] = useState(TEST_EMAIL_TIMEOUT_SECONDS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testFailedMessage, setTestFailedMessage] = useState<string | null>(null);
  const [smtpActive, setSmtpActive] = useState(false);
  const [passwordUnreadable, setPasswordUnreadable] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [tlsMode, setTlsMode] = useState<SmtpTlsMode>("starttls");
  const [username, setUsername] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [publicAppUrl, setPublicAppUrl] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);
  const [clearPassword, setClearPassword] = useState(false);

  const saveToastMessages = useMemo(
    () => ({
      loading: t(SAVE_TOAST.loading),
      success: t(SAVE_TOAST.success),
      error: t(SAVE_TOAST.error),
    }),
    [t],
  );

  const currentForm = useMemo<FormSnapshot>(
    () => ({
      host,
      port,
      tlsMode,
      username,
      emailFrom,
      publicAppUrl,
      passwordSet: clearPassword ? false : passwordSet,
      clearPassword,
    }),
    [host, port, tlsMode, username, emailFrom, publicAppUrl, passwordSet, clearPassword],
  );

  const applySettings = useCallback((settings: ServerMailSettingsResponseDto) => {
    const next = formFromSettings(settings);
    setHost(next.host);
    setPort(next.port);
    setTlsMode(next.tlsMode);
    setUsername(next.username);
    setEmailFrom(next.emailFrom);
    setPublicAppUrl(next.publicAppUrl);
    setPasswordSet(next.passwordSet);
    setClearPassword(false);
    setPassword("");
    setEditingPassword(settings.password_unreadable === true || !next.passwordSet);
    setPasswordUnreadable(settings.password_unreadable === true);
    setSmtpActive(settings.smtp_active === true);
    setTestFailedMessage(null);
  }, []);

  useEffect(() => {
    if (!core || !workspaceId) {
      setLoading(false);
      return;
    }
    const generation = ++loadGenerationRef.current;
    setLoading(true);
    setLoadError(null);
    void core
      .getServerMailSettings(workspaceId)
      .then((settings) => {
        if (loadGenerationRef.current !== generation) {
          return;
        }
        applySettings(settings);
      })
      .catch((error: unknown) => {
        if (loadGenerationRef.current !== generation) {
          return;
        }
        setLoadError(
          messageFromError(error, tRef.current("web.workspaceSettings.serverMail.loadError")),
        );
      })
      .finally(() => {
        if (loadGenerationRef.current === generation) {
          setLoading(false);
        }
      });
  }, [applySettings, core, workspaceId]);

  useEffect(() => {
    if (!editingPassword || !focusPasswordOnOpenRef.current) {
      return;
    }
    focusPasswordOnOpenRef.current = false;
    passwordInputRef.current?.focus();
  }, [editingPassword]);

  useEffect(() => {
    if (!testing) {
      setTestSecondsLeft(TEST_EMAIL_TIMEOUT_SECONDS);
      return;
    }
    setTestSecondsLeft(TEST_EMAIL_TIMEOUT_SECONDS);
    const intervalId = window.setInterval(() => {
      setTestSecondsLeft((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [testing]);

  function parsePortOrError(): number | null | "invalid" {
    const trimmed = port.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      return "invalid";
    }
    return parsed;
  }

  function collapsePasswordField() {
    if (passwordUnreadable || clearPassword || !passwordSet) {
      return;
    }
    setEditingPassword(false);
  }

  async function handleTestEmail() {
    if (!core || testing || saving || !canPut) {
      return;
    }
    const parsedPort = parsePortOrError();
    if (parsedPort === "invalid") {
      toast.error(t("web.workspaceSettings.serverMail.invalidPort"));
      return;
    }
    setTesting(true);
    setTestFailedMessage(null);
    let timedOut = false;
    let clientTimer: number | undefined;
    const body = buildPatch(currentForm, password);
    body.smtp_port = parsedPort;
    const request = core.sendServerMailTestEmail(workspaceId, body);
    try {
      const updated = await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          clientTimer = window.setTimeout(() => {
            timedOut = true;
            reject(new Error(t("web.workspaceSettings.serverMail.testTimeout")));
          }, TEST_EMAIL_CLIENT_TIMEOUT_MS);
        }),
      ]);
      loadGenerationRef.current += 1;
      applySettings(updated);
      toast.success(t("web.workspaceSettings.serverMail.testSuccess"));
    } catch (error: unknown) {
      const message = timedOut
        ? t("web.workspaceSettings.serverMail.testTimeout")
        : messageFromError(error, t("web.workspaceSettings.serverMail.testError"));
      setTestFailedMessage(message);
      if (timedOut) {
        void request.catch(() => undefined);
      }
    } finally {
      if (clientTimer !== undefined) {
        window.clearTimeout(clientTimer);
      }
      setTesting(false);
    }
  }

  async function handleSaveAnyway() {
    if (!core || testing || saving || !canPut) {
      return;
    }
    const parsedPort = parsePortOrError();
    if (parsedPort === "invalid") {
      toast.error(t("web.workspaceSettings.serverMail.invalidPort"));
      return;
    }
    setSaving(true);
    try {
      const body = buildPatch(currentForm, password);
      body.smtp_port = parsedPort;
      const updated = await runSaveWithToast(saveToastMessages, () =>
        core.updateServerMailSettings(workspaceId, body),
      );
      loadGenerationRef.current += 1;
      applySettings(updated);
    } catch {
      /* toast.promise surfaces the error */
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || testing;
  const fieldsDisabled = !canPut || busy;
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
        {!loading && !loadError ? (
          <Alert
            variant={smtpActive ? "info" : "error"}
            className="mt-4"
            data-testid="server-mail-status"
          >
            {smtpActive ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
              >
                <g clipPath="url(#server-mail-status-active-clip)">
                  <path
                    d="M6.00016 8.00016L7.3335 9.3335L10.0002 6.66683M14.6668 8.00016C14.6668 11.6821 11.6821 14.6668 8.00016 14.6668C4.31826 14.6668 1.3335 11.6821 1.3335 8.00016C1.3335 4.31826 4.31826 1.3335 8.00016 1.3335C11.6821 1.3335 14.6668 4.31826 14.6668 8.00016Z"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
                <defs>
                  <clipPath id="server-mail-status-active-clip">
                    <rect width="16" height="16" fill="white" />
                  </clipPath>
                </defs>
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
              >
                <path
                  d="M2 8C2 8.78793 2.15519 9.56815 2.45672 10.2961C2.75825 11.0241 3.20021 11.6855 3.75736 12.2426C4.31451 12.7998 4.97595 13.2417 5.7039 13.5433C6.43185 13.8448 7.21207 14 8 14C8.78793 14 9.56815 13.8448 10.2961 13.5433C11.0241 13.2417 11.6855 12.7998 12.2426 12.2426C12.7998 11.6855 13.2417 11.0241 13.5433 10.2961C13.8448 9.56815 14 8.78793 14 8C14 7.21207 13.8448 6.43185 13.5433 5.7039C13.2417 4.97595 12.7998 4.31451 12.2426 3.75736C11.6855 3.20021 11.0241 2.75825 10.2961 2.45672C9.56815 2.15519 8.78793 2 8 2C7.21207 2 6.43185 2.15519 5.7039 2.45672C4.97595 2.75825 4.31451 3.20021 3.75736 3.75736C3.20021 4.31451 2.75825 4.97595 2.45672 5.7039C2.15519 6.43185 2 7.21207 2 8Z"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 6V8.66667"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 10.6665V10.6732"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            <AlertDescription>
              {smtpActive
                ? t("web.workspaceSettings.serverMail.statusActive")
                : t("web.workspaceSettings.serverMail.statusInactive")}
            </AlertDescription>
          </Alert>
        ) : null}
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
              className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive dark:border-destructive/20"
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
                disabled={fieldsDisabled}
                onChange={(event) => setHost(event.target.value)}
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
                disabled={fieldsDisabled}
                onChange={(event) => setPort(event.target.value.replace(/[^\d]/g, ""))}
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
                disabled={fieldsDisabled}
                onValueChange={(value) => setTlsMode(value as SmtpTlsMode)}
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
                disabled={fieldsDisabled}
                onChange={(event) => setUsername(event.target.value)}
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
                  disabled={fieldsDisabled}
                  data-testid="server-mail-password"
                  onChange={(event) => {
                    setClearPassword(false);
                    setPassword(event.target.value);
                  }}
                  onBlur={() => collapsePasswordField()}
                />
              ) : (
                <div className="flex items-stretch" data-testid="server-mail-password-actions">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-r-none border-r-0 px-3"
                    disabled={fieldsDisabled}
                    data-testid="server-mail-change-password"
                    onClick={() => {
                      setClearPassword(false);
                      focusPasswordOnOpenRef.current = true;
                      setEditingPassword(true);
                    }}
                  >
                    {t("web.workspaceSettings.serverMail.changePassword")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="size-9 shrink-0 rounded-l-none px-0 text-destructive hover:text-destructive"
                    disabled={fieldsDisabled}
                    data-testid="server-mail-clear-password"
                    aria-label={t("web.workspaceSettings.serverMail.clearPassword")}
                    onClick={() => {
                      setPassword("");
                      setPasswordSet(false);
                      setClearPassword(true);
                      focusPasswordOnOpenRef.current = true;
                      setEditingPassword(true);
                    }}
                  >
                    <IconDelete16 className="size-4" />
                  </Button>
                </div>
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
                disabled={fieldsDisabled}
                onChange={(event) => setEmailFrom(event.target.value)}
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
                disabled={fieldsDisabled}
                onChange={(event) => setPublicAppUrl(event.target.value)}
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

          {testFailedMessage ? (
            <Alert variant="error" className="mt-6" data-testid="server-mail-test-failed">
              <AlertTitle>{t("web.workspaceSettings.serverMail.testFailedTitle")}</AlertTitle>
              <AlertDescription>
                <p>{testFailedMessage}</p>
                <p className="mt-2">{t("web.workspaceSettings.serverMail.testFailedBody")}</p>
              </AlertDescription>
            </Alert>
          ) : null}

          {canPut ? (
            <div className="mt-8 flex w-full items-center justify-end gap-2">
              {testFailedMessage ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 px-3"
                  disabled={fieldsDisabled}
                  data-testid="server-mail-save-anyway"
                  onClick={() => void handleSaveAnyway()}
                >
                  {saving
                    ? t("web.workspaceSettings.serverMail.saving")
                    : t("web.workspaceSettings.serverMail.saveAnyway")}
                </Button>
              ) : null}
              <Button
                type="button"
                className="h-9 px-3"
                disabled={fieldsDisabled}
                data-testid="server-mail-test"
                onClick={() => void handleTestEmail()}
              >
                {testing
                  ? t("web.workspaceSettings.serverMail.testingCountdown", {
                      seconds: testSecondsLeft,
                    })
                  : t("web.workspaceSettings.serverMail.test")}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
