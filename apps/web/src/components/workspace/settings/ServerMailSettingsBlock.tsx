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
} from "@okkey/ui";
import { useCallback, useEffect, useState } from "react";

import { useAuthenticatedCoreClient } from "../../../auth/AuthVaultContext";

type ServerMailSettingsBlockProps = {
  workspaceId: string;
  t: (messageKey: string, values?: WebMessageValues) => string;
};

const TLS_MODES: SmtpTlsMode[] = ["none", "starttls", "tls"];

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

function formFromSettings(settings: ServerMailSettingsResponseDto) {
  return {
    host: settings.smtp_host,
    port: String(settings.smtp_port),
    tlsMode: settings.smtp_tls_mode,
    username: settings.smtp_username,
    emailFrom: settings.email_from,
    publicAppUrl: settings.public_app_url,
    passwordSet: settings.password_set,
  };
}

export default function ServerMailSettingsBlock({ workspaceId, t }: ServerMailSettingsBlockProps) {
  const core = useAuthenticatedCoreClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [tlsMode, setTlsMode] = useState<SmtpTlsMode>("starttls");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [publicAppUrl, setPublicAppUrl] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);

  const applySettings = useCallback((settings: ServerMailSettingsResponseDto) => {
    const next = formFromSettings(settings);
    setHost(next.host);
    setPort(next.port);
    setTlsMode(next.tlsMode);
    setUsername(next.username);
    setEmailFrom(next.emailFrom);
    setPublicAppUrl(next.publicAppUrl);
    setPasswordSet(next.passwordSet);
    setPassword("");
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

  function currentBody(includePassword: boolean) {
    const parsedPort = Number(port);
    return {
      smtp_host: host.trim(),
      smtp_port: Number.isInteger(parsedPort) ? parsedPort : Number.NaN,
      smtp_tls_mode: tlsMode,
      smtp_username: username.trim(),
      email_from: emailFrom.trim(),
      public_app_url: publicAppUrl.trim(),
      ...(includePassword && password ? { password } : {}),
    };
  }

  async function handleSave() {
    if (!core || saving) {
      return;
    }
    const body = currentBody(true);
    if (!Number.isInteger(body.smtp_port)) {
      setStatus({ tone: "error", text: t("web.workspaceSettings.serverMail.invalidPort") });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const updated = await core.updateServerMailSettings(workspaceId, body);
      applySettings(updated);
      setStatus({ tone: "success", text: t("web.workspaceSettings.serverMail.saveSuccess") });
    } catch (error: unknown) {
      setStatus({
        tone: "error",
        text: messageFromError(error, t("web.workspaceSettings.serverMail.saveError")),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleClearPassword() {
    if (!core || clearing) {
      return;
    }
    setClearing(true);
    setStatus(null);
    try {
      const updated = await core.updateServerMailSettings(workspaceId, { clear_password: true });
      applySettings(updated);
      setStatus({ tone: "success", text: t("web.workspaceSettings.serverMail.clearPasswordSuccess") });
    } catch (error: unknown) {
      setStatus({
        tone: "error",
        text: messageFromError(error, t("web.workspaceSettings.serverMail.saveError")),
      });
    } finally {
      setClearing(false);
    }
  }

  async function handleTestEmail() {
    if (!core || testing) {
      return;
    }
    const body = currentBody(true);
    if (!Number.isInteger(body.smtp_port)) {
      setStatus({ tone: "error", text: t("web.workspaceSettings.serverMail.invalidPort") });
      return;
    }
    setTesting(true);
    setStatus(null);
    try {
      await core.sendServerMailTestEmail(workspaceId, body);
      setStatus({ tone: "success", text: t("web.workspaceSettings.serverMail.testSuccess") });
    } catch (error: unknown) {
      setStatus({
        tone: "error",
        text: messageFromError(error, t("web.workspaceSettings.serverMail.testError")),
      });
    } finally {
      setTesting(false);
    }
  }

  const busy = saving || testing || clearing;

  return (
    <section
      className="flex flex-col gap-4 border-t border-border pt-6"
      data-testid="server-mail-settings"
      aria-labelledby="server-mail-settings-title"
    >
      <div className="flex flex-col gap-1">
        <h2 id="server-mail-settings-title" className="text-lg font-semibold text-foreground">
          {t("web.workspaceSettings.serverMail.title")}
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
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="server-mail-host" className="text-sm font-medium text-foreground">
                {t("web.workspaceSettings.serverMail.smtpHost")}
              </label>
              <Input
                id="server-mail-host"
                value={host}
                autoComplete="off"
                disabled={busy}
                onChange={(event) => setHost(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="server-mail-port" className="text-sm font-medium text-foreground">
                {t("web.workspaceSettings.serverMail.smtpPort")}
              </label>
              <Input
                id="server-mail-port"
                inputMode="numeric"
                value={port}
                disabled={busy}
                onChange={(event) => setPort(event.target.value.replace(/[^\d]/g, ""))}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="server-mail-tls" className="text-sm font-medium text-foreground">
                {t("web.workspaceSettings.serverMail.tlsMode")}
              </label>
              <Select
                value={tlsMode}
                disabled={busy}
                onValueChange={(value) => setTlsMode(value as SmtpTlsMode)}
              >
                <SelectTrigger id="server-mail-tls" className="h-9 w-full">
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
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="server-mail-username" className="text-sm font-medium text-foreground">
                {t("web.workspaceSettings.serverMail.username")}
              </label>
              <Input
                id="server-mail-username"
                value={username}
                autoComplete="off"
                disabled={busy}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="server-mail-password" className="text-sm font-medium text-foreground">
              {t("web.workspaceSettings.serverMail.password")}
            </label>
            <Input
              id="server-mail-password"
              type="password"
              value={password}
              autoComplete="new-password"
              disabled={busy}
              placeholder={
                passwordSet
                  ? t("web.workspaceSettings.serverMail.passwordPlaceholder")
                  : undefined
              }
              onChange={(event) => setPassword(event.target.value)}
            />
            {passwordSet ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground">
                  {t("web.workspaceSettings.serverMail.passwordSet")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 px-3"
                  disabled={busy}
                  onClick={() => void handleClearPassword()}
                >
                  {clearing
                    ? t("web.workspaceSettings.serverMail.clearing")
                    : t("web.workspaceSettings.serverMail.clearPassword")}
                </Button>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="server-mail-from" className="text-sm font-medium text-foreground">
                {t("web.workspaceSettings.serverMail.emailFrom")}
              </label>
              <Input
                id="server-mail-from"
                type="email"
                value={emailFrom}
                autoComplete="off"
                disabled={busy}
                onChange={(event) => setEmailFrom(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="server-mail-public-url" className="text-sm font-medium text-foreground">
                {t("web.workspaceSettings.serverMail.publicAppUrl")}
              </label>
              <Input
                id="server-mail-public-url"
                type="url"
                value={publicAppUrl}
                autoComplete="off"
                disabled={busy}
                onChange={(event) => setPublicAppUrl(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" className="h-9 px-3" disabled={busy} onClick={() => void handleSave()}>
              {saving
                ? t("web.workspaceSettings.serverMail.saving")
                : t("web.workspaceSettings.serverMail.save")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9 px-3"
              disabled={busy}
              onClick={() => void handleTestEmail()}
            >
              {testing
                ? t("web.workspaceSettings.serverMail.testing")
                : t("web.workspaceSettings.serverMail.test")}
            </Button>
          </div>

          {status ? (
            <p
              className={status.tone === "error" ? "text-sm text-destructive" : "text-sm text-foreground"}
              role={status.tone === "error" ? "alert" : "status"}
            >
              {status.text}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
