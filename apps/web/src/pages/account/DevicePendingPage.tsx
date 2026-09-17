import { Button, Spinner } from "@okkey/ui";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";

import AccountUserBar from "../../components/account/AccountUserBar";
import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import {
  DeviceTypeIcon,
  resolveDeviceBrandIcon,
  resolveDeviceFormIcon,
} from "../../components/settings/DeviceTypeIcon";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { formatDeviceClientOs, formatDeviceTitle } from "../../auth/browserEnvironment";
import { useLocale } from "../../locale/LocaleContext";
import {
  ACCOUNT_LOCK_PATH,
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
    refreshDeviceTrust,
    retryDeviceRegistration,
    logout,
  } = useAuthVault();

  const redirect = useMemo(() => {
    const raw = searchParams.get("redirect");
    return raw && raw.startsWith("/") ? raw : null;
  }, [searchParams]);

  const [retrying, setRetrying] = useState(false);

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
      deviceTrustStatus !== "blocked"
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

  if (deviceTrustStatus === "idle" || deviceTrustStatus === "checking") {
    return (
      <AppShellLayout
        headerLeft={<OkkeyLogoMark />}
        headerRight={<AccountUserBar onLogout={() => logout()} />}
      >
        <div
          className="flex min-h-[50vh] w-full items-center justify-center"
          role="status"
          aria-busy="true"
        >
          <Spinner />
        </div>
      </AppShellLayout>
    );
  }

  const blocked = deviceTrustStatus === "blocked";
  const rejected = deviceTrustStatus === "rejected" || deviceTrustStatus === "error";

  return (
    <AppShellLayout
      headerLeft={<OkkeyLogoMark />}
      headerRight={<AccountUserBar onLogout={() => logout()} />}
    >
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold text-foreground">
            {blocked
              ? t("web.devicePending.blockedTitle")
              : rejected
                ? t("web.devicePending.rejectedTitle")
                : t("web.devicePending.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {blocked
              ? t("web.devicePending.blockedBody")
              : rejected
                ? t("web.devicePending.rejectedBody")
                : t("web.devicePending.body")}
          </p>
          {blocked ? (
            <p className="text-sm text-muted-foreground">
              {deviceBlockedUntil
                ? t("web.devicePending.blockedUntil", {
                    date: formatAbsoluteDate(deviceBlockedUntil, locale),
                  })
                : t("web.devicePending.blockedForever")}
            </p>
          ) : null}
        </div>

        {!rejected && !blocked ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-foreground">
              {t("web.devicePending.approversHeading")}
            </p>
            {deviceApprovers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("web.devicePending.approversEmpty")}
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-background">
                {deviceApprovers.map((device) => (
                  <li key={device.device_id} className="flex items-center gap-4 px-4 py-3">
                    <DeviceTypeIcon
                      form={resolveDeviceFormIcon(device)}
                      brand={resolveDeviceBrandIcon(device)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {formatDeviceTitle(device)}
                      </p>
                      <p className="text-sm text-muted-foreground">{formatDeviceClientOs(device)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2 pt-1 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              <span>{t("web.devicePending.waiting")}</span>
            </div>
          </div>
        ) : rejected ? (
          <div className="flex flex-col gap-3">
            <Button type="button" disabled={retrying} onClick={() => void onRetry()}>
              {retrying ? <Spinner data-icon="inline-start" /> : null}
              {t("web.devicePending.retry")}
            </Button>
          </div>
        ) : null}
      </div>
    </AppShellLayout>
  );
}
