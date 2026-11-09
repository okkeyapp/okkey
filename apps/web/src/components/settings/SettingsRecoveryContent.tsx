import { ApiRequestError } from "@okkey/api";
import {
  generateRecoverySecret,
  initCrypto,
  recoveryPossessionPublicKey,
  wrapVaultKeyWithRecoverySecret,
} from "@okkey/crypto";
import type { WebMessageValues } from "@okkey/i18n";
import type { AccountRecoveryStatusResponseDto } from "@okkey/types";
import { canEnableTrustedDevicesRecovery } from "@okkey/types";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ControlGroup,
  controlGroupItemGrowClassName,
  Skeleton,
  Switch,
} from "@okkey/ui";
import {
  Copy,
  Download,
  Info,
  RefreshCcw,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { useAuthenticatedCoreClient, useAuthVault } from "../../auth/AuthVaultContext";
import { getOrCreateDeviceFingerprint } from "../../auth/deviceFingerprint";
import { calendarDaysBetween } from "../../lib/calendarDaysBetween";
import { useLocale } from "../../locale/LocaleContext";
import { settingsPath } from "../../routes/paths";
import { downloadRecoveryKeyPdf } from "./recoveryKeyPdf";
import { RecoveryInfoTriangleIcon } from "./RecoveryInfoTriangleIcon";
import { SettingsRow } from "./SettingsRows";
import { useSettingsPopupCacheEntry } from "./useSettingsPopupCache";
import { getSettingsPopupCacheState } from "./settingsPopupCache";
import accountRecoveryModule from "@okkey-enterprise/account-recovery";

type SettingsRecoveryContentProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
};

function RecoveryKeyExportedCheckIcon({ className }: { className?: string }) {
  const reactId = useId();
  const clipId = `recovery-key-exported-check-clip-${reactId.replace(/:/g, "")}`;
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <g clipPath={`url(#${clipId})`}>
        <path
          d="M6.00016 8.00016L7.3335 9.3335L10.0002 6.66683M14.6668 8.00016C14.6668 11.6821 11.6821 14.6668 8.00016 14.6668C4.31826 14.6668 1.3335 11.6821 1.3335 8.00016C1.3335 4.31826 4.31826 1.3335 8.00016 1.3335C11.6821 1.3335 14.6668 4.31826 14.6668 8.00016Z"
          stroke="#16A34A"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <defs>
        <clipPath id={clipId}>
          <rect width="16" height="16" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

function recoveryErrorMessage(err: unknown, t: SettingsRecoveryContentProps["t"]): string {
  if (err instanceof ApiRequestError) {
    switch (err.body.error) {
      case "RECOVERY_ENTITLEMENT_REQUIRED":
        return t("web.settingsPopup.recovery.error.entitlement");
      case "RECOVERY_CONTACTS_INSUFFICIENT":
        return t("web.settingsPopup.recovery.error.contactsInsufficient");
      case "RECOVERY_DEVICES_INSUFFICIENT":
        return t("web.settingsPopup.recovery.error.devicesInsufficient");
      case "RECOVERY_CONTACT_NOT_FOUND":
        return t("web.settingsPopup.recovery.error.contactNotFound");
      case "RECOVERY_CONTACT_EXISTS":
        return t("web.settingsPopup.recovery.error.contactExists");
      case "RECOVERY_KEY_NOT_ENROLLED":
        return t("web.settingsPopup.recovery.error.keyNotEnrolled");
      case "RECOVERY_EMAIL_INVALID":
        return t("web.settingsPopup.recovery.error.invalidEmail");
      case "RECOVERY_SELF_INVITE":
        return t("web.settingsPopup.recovery.error.selfInvite");
      case "RECOVERY_BAD_REQUEST":
        if (err.body.message === "cannot invite yourself") {
          return t("web.settingsPopup.recovery.error.selfInvite");
        }
        if (err.body.message === "invalid email") {
          return t("web.settingsPopup.recovery.error.invalidEmail");
        }
        return t("web.settingsPopup.recovery.error.generic");
      default:
        return t("web.settingsPopup.recovery.error.generic");
    }
  }
  return t("web.settingsPopup.recovery.error.generic");
}

function formatGeneratedAt(
  iso: string | null | undefined,
  locale: string,
  t: SettingsRecoveryContentProps["t"],
): string {
  if (!iso) {
    return t("web.settingsPopup.recovery.key.never");
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return t("web.settingsPopup.recovery.key.never");
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
    return t("web.settingsPopup.recovery.key.generatedToday", { date: absolute });
  }
  if (days === 1) {
    return t("web.settingsPopup.recovery.key.generatedYesterday", { date: absolute });
  }
  return t("web.settingsPopup.recovery.key.generatedAgo", {
    date: absolute,
    days: String(days),
  });
}

function PaidMethodsUpsell({ t }: { t: SettingsRecoveryContentProps["t"] }) {
  return (
    <Alert variant="info" className="mt-4">
      <Info className="size-4" />
      <AlertTitle>{t("web.settingsPopup.recovery.upsell.title")}</AlertTitle>
      <AlertDescription>
        {t("web.settingsPopup.recovery.upsell.combinedPrefix")}
        <Link
          to={settingsPath("plan")}
          className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary"
        >
          {t("web.settingsPopup.recovery.upsell.combinedPlanLink")}
        </Link>
        {t("web.settingsPopup.recovery.upsell.combinedSuffix")}
      </AlertDescription>
    </Alert>
  );
}

export default function SettingsRecoveryContent({ t }: SettingsRecoveryContentProps) {
  const TrustedContactsSection = accountRecoveryModule.TrustedContactsSection;
  const { locale } = useLocale();
  const core = useAuthenticatedCoreClient();
  const { vaultKey } = useAuthVault();
  const tRef = useRef(t);
  tRef.current = t;

  const mapRecoveryError = useCallback(
    (err: unknown) => recoveryErrorMessage(err, tRef.current),
    [],
  );
  const ensureRecovery = useCallback(async () => {
    if (!core) {
      throw new Error("no core client");
    }
    return core.getAccountRecoveryStatus();
  }, [core]);
  const {
    data: status,
    error: cacheError,
    needsSkeleton: initialLoading,
    setData: setStatusCache,
    refresh,
  } = useSettingsPopupCacheEntry("recovery", ensureRecovery, mapRecoveryError);

  const fingerprint = useMemo(() => getOrCreateDeviceFingerprint(), []);
  const ensureDevices = useCallback(async () => {
    if (!core) {
      throw new Error("no core client");
    }
    const result = await core.listDevices(fingerprint);
    return {
      devices: result.devices,
      pending: result.pending,
      blocked: result.blocked ?? [],
    };
  }, [core, fingerprint]);
  const { data: devicesCache } = useSettingsPopupCacheEntry(
    "devices",
    ensureDevices,
    () => "devices",
  );
  const canEnableDevicesMethod = canEnableTrustedDevicesRecovery(devicesCache?.devices);

  const [error, setError] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const settingsMutatingRef = useRef(false);

  useEffect(() => {
    if (cacheError) {
      setError(cacheError);
    }
  }, [cacheError]);

  const setStatus = useCallback(
    (
      next:
        | AccountRecoveryStatusResponseDto
        | null
        | ((prev: AccountRecoveryStatusResponseDto | null) => AccountRecoveryStatusResponseDto | null),
    ) => {
      const prev = getSettingsPopupCacheState().recovery.data;
      const resolved = typeof next === "function" ? next(prev) : next;
      setStatusCache(resolved);
    },
    [setStatusCache],
  );

  const refreshStatus = useCallback(async (): Promise<AccountRecoveryStatusResponseDto | null> => {
    if (!core) {
      return null;
    }
    try {
      const next = await refresh({ quiet: true });
      setError(null);
      return next;
    } catch (err) {
      setError(recoveryErrorMessage(err, tRef.current));
      return null;
    }
  }, [core, refresh]);

  const notifySaved = useCallback(() => {
    toast.success(tRef.current("web.toast.save.success"));
  }, []);

  async function enrollOrRotate(rotate: boolean): Promise<string | null> {
    if (!core || !vaultKey) {
      setError(t("web.settingsPopup.recovery.error.vaultLocked"));
      return null;
    }
    setBusy(true);
    setError(null);
    try {
      await initCrypto();
      const secret = await generateRecoverySecret();
      const secretBytes = new TextEncoder().encode(secret);
      const encryptedBlob = await wrapVaultKeyWithRecoverySecret(vaultKey, secretBytes);
      const possessionPublicKey = await recoveryPossessionPublicKey(secretBytes);
      const result = rotate
        ? await core.rotateAccountRecoveryKey({ encryptedBlob, possessionPublicKey })
        : await core.enrollAccountRecoveryKey({ encryptedBlob, possessionPublicKey });
      setSessionKey(secret);
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              settings: result.settings,
              key: result.key,
            }
          : {
              entitlements: { recoveryKey: true, trustedDevices: false, trustedContacts: false },
              settings: result.settings,
              key: result.key,
              contacts: [],
              confirmedContactCount: 0,
              minConfirmedContacts: 3,
              pendingInvites: [],
              servingAsContact: [],
            },
      );
      void refreshStatus();
      return secret;
    } catch (err) {
      setError(recoveryErrorMessage(err, t));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleKeySwitch(checked: boolean) {
    if (!core || initialLoading || busy) {
      return;
    }
    if (checked) {
      if (status?.settings.keyEnabled && status.key.enrolled) {
        return;
      }
      const secret = await enrollOrRotate(false);
      if (secret) {
        notifySaved();
      }
      return;
    }
    // Recovery key is mandatory — disabling (and deleting the wrap) is not allowed.
    return;
  }

  async function handleDevicesSwitch(checked: boolean) {
    if (!core || !status?.entitlements.trustedDevices || settingsMutatingRef.current) {
      return;
    }
    // Gate enable only — leave an already-on method alone if device count drops.
    if (checked && !canEnableTrustedDevicesRecovery(devicesCache?.devices)) {
      return;
    }
    settingsMutatingRef.current = true;
    setStatus((prev) =>
      prev ? { ...prev, settings: { ...prev.settings, devicesEnabled: checked } } : prev,
    );
    try {
      const fingerprint = await getOrCreateDeviceFingerprint();
      const next = await core.patchAccountRecoverySettings(
        { devicesEnabled: checked },
        { currentFingerprint: fingerprint },
      );
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              settings: next.settings,
              entitlements: next.entitlements,
            }
          : next,
      );
      notifySaved();
    } catch (err) {
      setError(recoveryErrorMessage(err, t));
      void refreshStatus();
    } finally {
      settingsMutatingRef.current = false;
    }
  }

  async function handleCopy() {
    if (!sessionKey || !core) {
      return;
    }
    try {
      await navigator.clipboard.writeText(sessionKey);
      const next = await core.ackAccountRecoveryKeyExport();
      setStatus(next);
      notifySaved();
    } catch {
      setError(t("web.settingsPopup.recovery.error.copyFailed"));
    }
  }

  async function handleDownloadPdf() {
    if (!sessionKey || !core) {
      return;
    }
    const toastId = toast.loading(t("web.settingsPopup.recovery.key.creatingPdf"));
    try {
      await downloadRecoveryKeyPdf(sessionKey, {
        title: t("web.settingsPopup.recovery.key.pdfTitle"),
        description: t("web.settingsPopup.recovery.key.pdfDescription"),
      });
      const next = await core.ackAccountRecoveryKeyExport();
      setStatus(next);
    } catch {
      setError(t("web.settingsPopup.recovery.error.generic"));
    } finally {
      toast.dismiss(toastId);
    }
  }

  async function handleRegenerate() {
    const secret = await enrollOrRotate(true);
    if (secret) {
      try {
        await navigator.clipboard.writeText(secret);
      } catch {
        /* best-effort */
      }
      toast.success(t("web.settingsPopup.recovery.key.regeneratedToast"));
    }
  }

  const keyEnabled = Boolean(status?.settings.keyEnabled && status.key.enrolled);
  const devicesEnabled = Boolean(status?.settings.devicesEnabled);
  const canDevices = Boolean(status?.entitlements.trustedDevices);
  const canContacts = Boolean(status?.entitlements.trustedContacts);
  const devicesEnableBlocked = !devicesEnabled && !canEnableDevicesMethod;
  const showPaidUpsell = Boolean(status) && !canDevices && !canContacts;
  const showKeyPanel = keyEnabled;
  const generatedLabel = formatGeneratedAt(
    status?.key.rotatedAt ?? status?.key.createdAt,
    locale,
    t,
  );
  const keyExported = Boolean(status?.key.exportedAt);

  return (
    <div
      className="flex min-h-[min(420px,calc(100dvh-32px))] flex-col"
      aria-label={t("web.settingsPopup.recovery.title")}
      aria-busy={initialLoading || undefined}
    >
      {error ? (
        <Alert variant="error" className="mb-2">
          <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {initialLoading ? (
        <div className="flex flex-col" role="status" aria-label={t("web.settingsPopup.recovery.loading")}>
          <SettingsRow
            label={t("web.settingsPopup.recovery.key.label")}
            description={t("web.settingsPopup.recovery.key.description")}
            border={false}
            controlClassName="w-[100px]"
          >
            <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
          </SettingsRow>
          <div className="mb-4 flex flex-col gap-4 rounded-xl bg-secondary p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-9 min-w-0 flex-1 rounded-md" />
              <Skeleton className="h-9 w-36 shrink-0 rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-5 w-56 max-w-full" />
              <Skeleton className="h-5 w-48 max-w-full" />
            </div>
            <Skeleton className="h-5 w-full max-w-md" />
          </div>
        </div>
      ) : (
        <>
      <SettingsRow
        label={t("web.settingsPopup.recovery.key.label")}
        description={t("web.settingsPopup.recovery.key.description")}
        border={false}
        controlClassName="w-[100px]"
      >
        <Switch
          size="lg"
          checked={keyEnabled}
          disabled={!core || busy || initialLoading || keyEnabled}
          onCheckedChange={(checked) => void handleKeySwitch(checked)}
          aria-label={t("web.settingsPopup.recovery.key.label")}
        />
      </SettingsRow>

      {showKeyPanel ? (
        <div className="mb-4 flex flex-col gap-4 rounded-xl bg-secondary p-4">
          <div className="flex flex-wrap items-center gap-3">
            {sessionKey ? (
              <ControlGroup
                className="min-w-0 flex-1"
                aria-label={t("web.settingsPopup.recovery.key.actionsAria")}
              >
                <Button
                  type="button"
                  variant="outline"
                  className={`${controlGroupItemGrowClassName} h-9 gap-2.5 bg-background`}
                  onClick={() => void handleCopy()}
                >
                  <Copy className="size-4 shrink-0" />
                  {t("web.settingsPopup.recovery.key.copy")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={`${controlGroupItemGrowClassName} h-9 gap-2.5 bg-background`}
                  onClick={() => void handleDownloadPdf()}
                >
                  <Download className="size-4 shrink-0" />
                  {t("web.settingsPopup.recovery.key.downloadPdf")}
                </Button>
              </ControlGroup>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-2.5 bg-background px-4"
              disabled={busy || !vaultKey}
              onClick={() => void handleRegenerate()}
            >
              <RefreshCcw className="size-4 shrink-0" />
              {t("web.settingsPopup.recovery.key.regenerate")}
            </Button>
          </div>
          {!sessionKey ? (
            <p className="w-full text-sm leading-5 text-muted-foreground">
              {t("web.settingsPopup.recovery.key.sessionHint")}
            </p>
          ) : null}
          <div className="text-sm leading-5 text-muted-foreground">
            <p>
              <span className="text-muted-foreground">
                {t("web.settingsPopup.recovery.key.lastGeneratedPrefix")}
              </span>{" "}
              <span className="font-medium text-foreground">{generatedLabel}</span>
            </p>
            <p className="flex items-center gap-1.5">
              <span className="text-muted-foreground">
                {t("web.settingsPopup.recovery.key.exportedPrefix")}
              </span>{" "}
              {keyExported ? (
                <RecoveryKeyExportedCheckIcon className="size-4 shrink-0" />
              ) : (
                <span className="font-medium text-destructive">
                  {t("web.settingsPopup.recovery.key.never")}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-start gap-1.5">
            <RecoveryInfoTriangleIcon className="mt-0.5" />
            <p className="min-w-0 flex-1 text-sm leading-5 text-muted-foreground">
              {t("web.settingsPopup.recovery.key.regenerateWarning")}
            </p>
          </div>
        </div>
      ) : null}

      {canDevices ? (
        <>
          <SettingsRow
            label={t("web.settingsPopup.recovery.devices.label")}
            description={t("web.settingsPopup.recovery.devices.description")}
            controlClassName="w-[100px]"
          >
            <Switch
              size="lg"
              checked={devicesEnabled}
              disabled={devicesEnableBlocked}
              onCheckedChange={(checked) => void handleDevicesSwitch(checked)}
              aria-label={t("web.settingsPopup.recovery.devices.label")}
            />
          </SettingsRow>
          {devicesEnableBlocked ? (
            <p className="-mt-2 mb-4 text-sm leading-5 text-muted-foreground">
              {t("web.settingsPopup.recovery.devices.needAnother")}
            </p>
          ) : null}
        </>
      ) : null}

      {TrustedContactsSection && canContacts ? <TrustedContactsSection /> : null}

      {showPaidUpsell ? <PaidMethodsUpsell t={t} /> : null}
        </>
      )}
    </div>
  );
}
