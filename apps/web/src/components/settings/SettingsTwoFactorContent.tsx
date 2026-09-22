import { ApiRequestError } from "@okkey/api";
import { AuthClient } from "@okkey/auth";
import type { WebMessageValues } from "@okkey/i18n";
import type { TotpEnrollStartResponseDto, TwoFactorStatusResponseDto } from "@okkey/types";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ControlGroup,
  controlGroupItemGrowClassName,
  Switch,
} from "@okkey/ui";
import { Copy, Download, FileText, Info, RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import { calendarDaysBetween } from "../../lib/calendarDaysBetween";
import { useLocale } from "../../locale/LocaleContext";
import {
  downloadBackupCodesPdf,
  formatBackupCodesForClipboard,
} from "./backupCodesPdf";
import { SettingsRow, SettingsSectionDivider, SettingsSectionHeading } from "./SettingsRows";
import TotpCodeConfirmPopup from "./TotpCodeConfirmPopup";
import TotpEnrollPopup from "./TotpEnrollPopup";
import { useSettingsPopupCacheEntry } from "./useSettingsPopupCache";
import { getSettingsPopupCacheState } from "./settingsPopupCache";

type SettingsTwoFactorContentProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
};

type ConfirmMode = "disable" | "regenerate" | null;

function twoFactorErrorMessage(
  err: unknown,
  t: SettingsTwoFactorContentProps["t"],
): string {
  if (err instanceof ApiRequestError) {
    switch (err.body.error) {
      case "TWO_FACTOR_INVALID_CODE":
        return t("web.settingsPopup.twoFactor.error.invalidCode");
      case "TWO_FACTOR_ALREADY_ENABLED":
        return t("web.settingsPopup.twoFactor.error.alreadyEnabled");
      case "TWO_FACTOR_NOT_ENABLED":
        return t("web.settingsPopup.twoFactor.error.notEnabled");
      case "TWO_FACTOR_SETUP_INVALID":
        return t("web.settingsPopup.twoFactor.error.setupInvalid");
      default:
        return t("web.settingsPopup.twoFactor.error.generic");
    }
  }
  return t("web.settingsPopup.twoFactor.error.generic");
}

function formatBackupCodesGeneratedAt(
  iso: string | null | undefined,
  locale: string,
  t: SettingsTwoFactorContentProps["t"],
): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const absolute = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  const days = Math.max(0, calendarDaysBetween(date));
  if (days === 0) {
    return t("web.settingsPopup.twoFactor.backup.lastGeneratedToday", { date: absolute });
  }
  if (days === 1) {
    return t("web.settingsPopup.twoFactor.backup.lastGeneratedYesterday", { date: absolute });
  }
  return t("web.settingsPopup.twoFactor.backup.lastGeneratedAgo", {
    date: absolute,
    days: String(days),
  });
}

export default function SettingsTwoFactorContent({ t }: SettingsTwoFactorContentProps) {
  const { locale } = useLocale();
  const core = useAuthenticatedCoreClient();
  const auth = useMemo(
    () => (core ? new AuthClient(core.getHttpClient()) : null),
    [core],
  );

  const mapTwoFactorError = useCallback((err: unknown) => twoFactorErrorMessage(err, t), [t]);
  const ensureTwoFactor = useCallback(async () => {
    if (!auth) {
      throw new Error("no auth client");
    }
    return auth.getTwoFactorStatus();
  }, [auth]);
  const {
    data: status,
    error: cacheError,
    needsSkeleton: loading,
    setData: setStatusCache,
  } = useSettingsPopupCacheEntry("twoFactor", ensureTwoFactor, mapTwoFactorError);

  const setStatus = useCallback(
    (
      next:
        | TwoFactorStatusResponseDto
        | null
        | ((prev: TwoFactorStatusResponseDto | null) => TwoFactorStatusResponseDto | null),
    ) => {
      const prev = getSettingsPopupCacheState().twoFactor.data;
      const resolved = typeof next === "function" ? next(prev) : next;
      setStatusCache(resolved);
    },
    [setStatusCache],
  );

  const [error, setError] = useState<string | null>(null);
  const [sessionBackupCodes, setSessionBackupCodes] = useState<string[] | null>(null);

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollment, setEnrollment] = useState<TotpEnrollStartResponseDto | null>(null);
  const [loadingEnrollment, setLoadingEnrollment] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);

  const [confirmMode, setConfirmMode] = useState<ConfirmMode>(null);

  const enabled = Boolean(status?.enabled);

  useEffect(() => {
    if (cacheError) {
      setError(cacheError);
    }
  }, [cacheError]);

  const notifySaved = useCallback(() => {
    toast.success(t("web.toast.save.success"));
  }, [t]);

  // Mutations update cache via setStatus; no separate reload needed.

  const startEnrollment = useCallback(async () => {
    if (!auth) {
      return;
    }
    setEnrollOpen(true);
    setEnrollment(null);
    setEnrollmentError(null);
    setLoadingEnrollment(true);
    try {
      const started = await auth.startTotpEnrollment();
      setEnrollment(started);
    } catch (err) {
      setEnrollmentError(twoFactorErrorMessage(err, t));
    } finally {
      setLoadingEnrollment(false);
    }
  }, [auth, t]);

  function handleSwitchChange(checked: boolean) {
    if (!auth || loading) {
      return;
    }
    if (checked) {
      if (enabled) {
        return;
      }
      void startEnrollment();
      return;
    }
    if (!enabled) {
      return;
    }
    setConfirmMode("disable");
  }

  function closeEnroll() {
    setEnrollOpen(false);
    setEnrollment(null);
    setEnrollmentError(null);
  }

  async function handleEnrollConfirm(code: string) {
    if (!auth || !enrollment) {
      throw new Error(t("web.settingsPopup.twoFactor.error.generic"));
    }
    try {
      const result = await auth.confirmTotpEnrollment({
        enrollmentId: enrollment.enrollmentId,
        code,
      });
      setSessionBackupCodes(result.backupCodes);
      setStatus({
        enabled: true,
        backupCodesRemaining: result.backupCodes.length,
        backupCodesGeneratedAt: new Date().toISOString(),
        backupCodesExportedAt: null,
      });
      closeEnroll();
      notifySaved();
    } catch (err) {
      throw new Error(twoFactorErrorMessage(err, t));
    }
  }

  async function handleDisableConfirm(code: string) {
    if (!auth) {
      throw new Error(t("web.settingsPopup.twoFactor.error.generic"));
    }
    try {
      await auth.disableTwoFactor({ totpCode: code });
      setStatus({
        enabled: false,
        backupCodesRemaining: 0,
        backupCodesGeneratedAt: null,
        backupCodesExportedAt: null,
      });
      setSessionBackupCodes(null);
      setConfirmMode(null);
      notifySaved();
    } catch (err) {
      throw new Error(twoFactorErrorMessage(err, t));
    }
  }

  async function handleRegenerateConfirm(code: string) {
    if (!auth) {
      throw new Error(t("web.settingsPopup.twoFactor.error.generic"));
    }
    try {
      const result = await auth.regenerateBackupCodes({ totpCode: code });
      const generatedAt = new Date().toISOString();
      setSessionBackupCodes(result.backupCodes);
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              backupCodesRemaining: result.backupCodes.length,
              backupCodesGeneratedAt: generatedAt,
              backupCodesExportedAt: null,
            }
          : {
              enabled: true,
              backupCodesRemaining: result.backupCodes.length,
              backupCodesGeneratedAt: generatedAt,
              backupCodesExportedAt: null,
            },
      );
      setConfirmMode(null);
      try {
        await navigator.clipboard.writeText(formatBackupCodesForClipboard(result.backupCodes));
        const ack = await auth.ackBackupCodesExport();
        setStatus(ack);
      } catch {
        /* copy/ack is best-effort after regenerate */
      }
      toast.success(t("web.settingsPopup.twoFactor.backup.regeneratedToast"));
    } catch (err) {
      throw new Error(twoFactorErrorMessage(err, t));
    }
  }

  async function handleCopyCodes() {
    if (!sessionBackupCodes?.length || !auth) {
      return;
    }
    try {
      await navigator.clipboard.writeText(formatBackupCodesForClipboard(sessionBackupCodes));
      const ack = await auth.ackBackupCodesExport();
      setStatus(ack);
      notifySaved();
    } catch {
      setError(t("web.settingsPopup.twoFactor.error.copyFailed"));
    }
  }

  async function handleDownloadPdf() {
    if (!sessionBackupCodes?.length || !auth) {
      return;
    }
    const toastId = toast.loading(t("web.settingsPopup.twoFactor.backup.creatingPdf"), {
      icon: <FileText className="size-4 text-primary" aria-hidden />,
    });
    try {
      await downloadBackupCodesPdf(sessionBackupCodes, {
        title: t("web.settingsPopup.twoFactor.backup.pdfTitle"),
        description: t("web.settingsPopup.twoFactor.backup.pdfDescription"),
      });
      const ack = await auth.ackBackupCodesExport();
      setStatus(ack);
      notifySaved();
    } catch {
      setError(t("web.settingsPopup.twoFactor.error.generic"));
    } finally {
      toast.dismiss(toastId);
    }
  }

  const switchChecked = enabled;
  const hasSessionCodes = Boolean(sessionBackupCodes && sessionBackupCodes.length > 0);
  const lastGeneratedLabel = formatBackupCodesGeneratedAt(
    status?.backupCodesGeneratedAt,
    locale,
    t,
  );

  return (
    <div
      className="flex min-h-[min(420px,calc(100dvh-32px))] flex-col"
      aria-label={t("web.settingsPopup.twoFactor.title")}
    >
      {error ? (
        <Alert variant="error" className="mb-2">
          <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <SettingsRow
        label={t("web.settingsPopup.twoFactor.authenticator.label")}
        description={t("web.settingsPopup.twoFactor.authenticator.description")}
        border={false}
        controlClassName="w-[100px]"
      >
        {loading ? (
          <div className="h-6 w-11 shrink-0" aria-hidden />
        ) : (
          <Switch
            size="lg"
            checked={switchChecked}
            disabled={!auth}
            onCheckedChange={handleSwitchChange}
            aria-label={t("web.settingsPopup.twoFactor.authenticator.label")}
          />
        )}
      </SettingsRow>

      {enabled ? (
        <>
          <SettingsSectionDivider />
          <SettingsSectionHeading>
            {t("web.settingsPopup.twoFactor.additionalSection")}
          </SettingsSectionHeading>
          <div className="py-4">
            <p className="text-sm font-medium leading-5 text-foreground">
              {t("web.settingsPopup.twoFactor.backup.label")}
            </p>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {t("web.settingsPopup.twoFactor.backup.description")}
            </p>
          </div>
          <div className="mb-4 flex flex-col gap-4 rounded-xl bg-secondary p-4">
            <div className="flex flex-wrap items-center gap-3">
              {hasSessionCodes ? (
                <ControlGroup
                  className="min-w-0 flex-1"
                  aria-label={t("web.settingsPopup.twoFactor.backup.actionsAria")}
                >
                  <Button
                    type="button"
                    variant="outline"
                    className={`${controlGroupItemGrowClassName} h-9 gap-2.5 bg-background`}
                    onClick={() => void handleCopyCodes()}
                  >
                    <Copy className="size-4 shrink-0" />
                    {t("web.settingsPopup.twoFactor.backup.copy")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={`${controlGroupItemGrowClassName} h-9 gap-2.5 bg-background`}
                    onClick={() => void handleDownloadPdf()}
                  >
                    <Download className="size-4 shrink-0" />
                    {t("web.settingsPopup.twoFactor.backup.downloadPdf")}
                  </Button>
                </ControlGroup>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="h-9 gap-2.5 bg-background px-4"
                onClick={() => setConfirmMode("regenerate")}
              >
                <RefreshCcw className="size-4 shrink-0" />
                {t("web.settingsPopup.twoFactor.backup.regenerate")}
              </Button>
            </div>
            {typeof status?.backupCodesRemaining === "number" ? (
              <p className="text-sm font-semibold leading-5 text-copy-primary">
                {t("web.settingsPopup.twoFactor.backup.remaining", {
                  count: String(status.backupCodesRemaining),
                })}
              </p>
            ) : null}
            {lastGeneratedLabel ? (
              <p className="text-sm leading-5 text-muted-foreground">{lastGeneratedLabel}</p>
            ) : null}
            <div className="flex items-start gap-1.5">
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="min-w-0 flex-1 text-sm leading-5 text-muted-foreground">
                {t("web.settingsPopup.twoFactor.backup.regenerateWarning")}
              </p>
            </div>
          </div>
        </>
      ) : null}

      <TotpEnrollPopup
        open={enrollOpen}
        t={t}
        enrollment={enrollment}
        loadingEnrollment={loadingEnrollment}
        enrollmentError={enrollmentError}
        onClose={closeEnroll}
        onConfirm={handleEnrollConfirm}
      />

      <TotpCodeConfirmPopup
        open={confirmMode === "disable"}
        t={t}
        header={t("web.settingsPopup.twoFactor.disable.title")}
        description={t("web.settingsPopup.twoFactor.disable.description")}
        confirmLabel={t("web.settingsPopup.twoFactor.disable.confirm")}
        onClose={() => setConfirmMode(null)}
        onConfirm={handleDisableConfirm}
      />

      <TotpCodeConfirmPopup
        open={confirmMode === "regenerate"}
        t={t}
        header={t("web.settingsPopup.twoFactor.backup.regenerateTitle")}
        description={t("web.settingsPopup.twoFactor.backup.regenerateDescription")}
        confirmLabel={t("web.settingsPopup.twoFactor.backup.regenerateConfirm")}
        onClose={() => setConfirmMode(null)}
        onConfirm={handleRegenerateConfirm}
      />
    </div>
  );
}
