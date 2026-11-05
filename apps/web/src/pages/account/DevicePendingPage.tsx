import {
  formatDeviceClientOs,
  formatDeviceTitle,
  type DevicePendingApprover,
  DevicePendingView,
  OkkeyLogoMark,
  Spinner,
  Button,
} from "@okkey/ui";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";

import AccountUserBar from "../../components/account/AccountUserBar";
import AppShellLayout from "../../components/app-shell/AppShellLayout";
import { useAuthenticatedCoreClient, useAuthVault } from "../../auth/AuthVaultContext";
import {
  approvePendingDeviceWithPasskey,
  passkeyApprovalErrorMessageKey,
  type PasskeyApprovalErrorCode,
} from "../../auth/passkeyDeviceApproval";
import { useLocale } from "../../locale/LocaleContext";
import {
  ACCOUNT_LOCK_PATH,
  ACCOUNT_RESTORE_PATH,
  AUTH_EMAIL_PATH,
  accountLockWithRedirectQuery,
} from "../../routes/paths";

function formatAbsoluteDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function DevicePendingPage() {
  const { t, locale } = useLocale();
  const [searchParams] = useSearchParams();
  const {
    accessToken,
    deviceTrustStatus,
    deviceBlockedUntil,
    deviceApprovers,
    deviceNeedsRecovery,
    refreshDeviceTrust,
    retryDeviceRegistration,
    currentDeviceId,
  } = useAuthVault();
  const core = useAuthenticatedCoreClient();

  const redirect = useMemo(() => {
    const raw = searchParams.get("redirect");
    return raw && raw.startsWith("/") ? raw : null;
  }, [searchParams]);

  const [retrying, setRetrying] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<PasskeyApprovalErrorCode | null>(null);

  const onPasskeyApprove = async () => {
    if (!core || !currentDeviceId || passkeyBusy) {
      return;
    }
    setPasskeyBusy(true);
    setPasskeyError(null);
    try {
      const result = await approvePendingDeviceWithPasskey(core, currentDeviceId);
      if (!result.ok) {
        setPasskeyError(result.code);
        return;
      }
      await refreshDeviceTrust();
    } finally {
      setPasskeyBusy(false);
    }
  };

  const onRetry = async () => {
    if (retrying) {
      return;
    }
    setRetrying(true);
    try {
      await retryDeviceRegistration();
    } finally {
      setRetrying(false);
    }
  };

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    if (
      deviceTrustStatus !== "pending" &&
      deviceTrustStatus !== "checking" &&
      deviceTrustStatus !== "blocked" &&
      deviceTrustStatus !== "error"
    ) {
      return;
    }
    void refreshDeviceTrust();
    const timer = window.setInterval(() => {
      void refreshDeviceTrust();
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [accessToken, deviceTrustStatus, refreshDeviceTrust]);

  if (!accessToken) {
    return <Navigate to={AUTH_EMAIL_PATH} replace />;
  }

  if (deviceTrustStatus === "trusted") {
    const target = redirect
      ? accountLockWithRedirectQuery(encodeURIComponent(redirect))
      : ACCOUNT_LOCK_PATH;
    return <Navigate to={target} replace />;
  }

  const blocked = deviceTrustStatus === "blocked";
  // Only an actual denial/revocation uses the denied copy. `error` is a failed
  // lookup or rebind, including a device that is still waiting for approval.
  const denied = deviceTrustStatus === "rejected";
  const checking = deviceTrustStatus === "idle" || deviceTrustStatus === "checking";
  const failed = deviceTrustStatus === "error";

  const title = blocked
    ? t("web.devicePending.blockedTitle")
    : denied
      ? t("web.devicePending.rejectedTitle")
      : t("web.devicePending.title");
  const description = blocked
    ? t("web.devicePending.blockedBody")
    : deviceNeedsRecovery
      ? t("web.devicePending.recoveryRequiredBody")
      : denied
        ? t("web.devicePending.rejectedBody")
        : t("web.devicePending.body");

  const mode = checking ? "checking" : blocked ? "blocked" : denied ? "rejected" : "pending";
  const showRetry = (denied || failed) && !deviceNeedsRecovery;

  const approvers: DevicePendingApprover[] = deviceApprovers.map((device) => ({
    ...device,
    title: formatDeviceTitle(device),
    subtitle: formatDeviceClientOs(device),
  }));

  return (
    <AppShellLayout
      title={title}
      description={description}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
      contentClassName="max-w-lg"
    >
      <div className="flex w-full flex-col gap-6">
        <AccountUserBar />

        <DevicePendingView
          mode={mode}
          approversHeading={t("web.devicePending.approversHeading")}
          approversEmpty={t("web.devicePending.approversEmpty")}
          waitingLabel={t("web.devicePending.waiting")}
          blockedDetail={
            blocked
              ? deviceBlockedUntil
                ? t("web.devicePending.blockedUntil", {
                    date: formatAbsoluteDate(deviceBlockedUntil, locale),
                  })
                : t("web.devicePending.blockedForever")
              : undefined
          }
          approvers={approvers}
          actions={
            mode === "pending" && currentDeviceId ? (
              <div className="flex flex-col gap-3">
                <Button
                  type="button"
                  disabled={passkeyBusy}
                  onClick={() => void onPasskeyApprove()}
                >
                  {passkeyBusy ? <Spinner data-icon="inline-start" /> : null}
                  {passkeyBusy
                    ? t("web.devicePending.passkeyBusy")
                    : t("web.devicePending.passkeyApprove")}
                </Button>
                {passkeyError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {t(passkeyApprovalErrorMessageKey(passkeyError))}
                  </p>
                ) : null}
                <Button type="button" variant="outline" asChild>
                  <Link to={ACCOUNT_RESTORE_PATH}>{t("web.devicePending.recoveryRequiredCta")}</Link>
                </Button>
              </div>
            ) : showRetry ? (
              <Button type="button" disabled={retrying} onClick={() => void onRetry()}>
                {retrying ? <Spinner data-icon="inline-start" /> : null}
                {t("web.devicePending.retry")}
              </Button>
            ) : denied && deviceNeedsRecovery ? (
              <Button type="button" asChild>
                <Link to={ACCOUNT_RESTORE_PATH}>{t("web.devicePending.recoveryRequiredCta")}</Link>
              </Button>
            ) : mode === "pending" ? (
              <Button type="button" variant="outline" asChild>
                <Link to={ACCOUNT_RESTORE_PATH}>{t("web.devicePending.recoveryRequiredCta")}</Link>
              </Button>
            ) : null
          }
        />
      </div>
    </AppShellLayout>
  );
}
