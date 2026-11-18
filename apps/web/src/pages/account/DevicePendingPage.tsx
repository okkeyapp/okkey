import {
  formatDeviceClientOs,
  formatDeviceTitle,
  type DevicePendingApprover,
  DevicePendingView,
  OkkeyLogoMark,
  Spinner,
  Button,
} from "@okkey/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import AccountUserBar from "../../components/account/AccountUserBar";
import AppShellLayout from "../../components/app-shell/AppShellLayout";
import { useAuthenticatedCoreClient, useAuthVault } from "../../auth/AuthVaultContext";
import {
  approvePendingDeviceWithPasskey,
  passkeyApprovalErrorMessageKey,
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
    userId,
    deviceApprovalWatch,
    deviceTrustStatus,
    deviceBlockedUntil,
    deviceApprovers,
    deviceNeedsRecovery,
    deviceShareReapproval,
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
  const passkeyAttemptRef = useRef(0);

  // Clear stale passkey feedback whenever this waiting screen is shown again.
  useEffect(() => {
    if (deviceTrustStatus === "pending" || deviceTrustStatus === "checking") {
      setPasskeyBusy(false);
      passkeyAttemptRef.current += 1;
    }
  }, [deviceTrustStatus]);

  const onPasskeyApprove = async () => {
    if (passkeyBusy) {
      return;
    }
    if (!currentDeviceId) {
      return;
    }
    if (!core) {
      toast.error(t("web.devicePending.passkey.session_required"));
      return;
    }
    const attempt = ++passkeyAttemptRef.current;
    setPasskeyBusy(true);
    try {
      // Fresh options every click: wrap keys and passkey permissions can change
      // after a rejection, "Try again", reload, or a permission toggle elsewhere.
      const result = await approvePendingDeviceWithPasskey(core, currentDeviceId, {
        userId,
      });
      if (attempt !== passkeyAttemptRef.current) {
        return;
      }
      if (!result.ok) {
        const message = t(passkeyApprovalErrorMessageKey(result.code));
        if (result.code === "cancelled") {
          toast.message(message);
        } else {
          toast.error(message);
        }
        return;
      }
      await refreshDeviceTrust();
    } finally {
      if (attempt === passkeyAttemptRef.current) {
        setPasskeyBusy(false);
      }
    }
  };

  const onRetry = async () => {
    if (retrying) {
      return;
    }
    setRetrying(true);
    try {
      await retryDeviceRegistration();
      // Refetch trusted-device list and pending state for a clean attempt.
      await refreshDeviceTrust();
    } finally {
      setRetrying(false);
    }
  };

  useEffect(() => {
    if (!accessToken && !deviceApprovalWatch) {
      return;
    }
    if (
      deviceTrustStatus !== "pending" &&
      deviceTrustStatus !== "checking" &&
      deviceTrustStatus !== "blocked" &&
      deviceTrustStatus !== "error" &&
      deviceTrustStatus !== "rejected"
    ) {
      return;
    }
    void refreshDeviceTrust();
    const timer = window.setInterval(() => {
      void refreshDeviceTrust();
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [accessToken, deviceApprovalWatch, deviceTrustStatus, refreshDeviceTrust]);

  if (deviceTrustStatus === "trusted") {
    if (!accessToken) {
      return <Navigate to={AUTH_EMAIL_PATH} replace />;
    }
    const target = redirect
      ? accountLockWithRedirectQuery(encodeURIComponent(redirect))
      : ACCOUNT_LOCK_PATH;
    return <Navigate to={target} replace />;
  }

  if (!accessToken && !deviceApprovalWatch) {
    return <Navigate to={AUTH_EMAIL_PATH} replace />;
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
        : deviceShareReapproval
          ? t("web.devicePending.shareDeliveryReset")
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
