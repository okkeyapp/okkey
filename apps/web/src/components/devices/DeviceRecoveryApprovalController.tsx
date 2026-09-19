import { createBearerApiClient } from "@okkey/api";
import type { EnterpriseDeviceRecoveryRequestDto } from "@okkey-enterprise/types";
import { EnterpriseAccountRecoveryClient } from "@okkey-enterprise/api";
import {
  base64ToBytes,
  wrapVaultKeyForDeviceRequest,
} from "@okkey-enterprise/recovery-crypto";
import {
  Button,
  ControlGroup,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popup,
  buttonVariants,
  cn,
  controlGroupItemFixedClassName,
} from "@okkey/ui";
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import accountRecoveryModule from "@okkey-enterprise/account-recovery";
import { useAuthVault, useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import { formatDeviceClientOs, formatDeviceTitle } from "../../auth/browserEnvironment";
import { IconCheck16, IconNotNow16 } from "../items/itemCategoryIcons";
import {
  DeviceTypeIcon,
  resolveDeviceBrandIcon,
  resolveDeviceFormIcon,
} from "../settings/DeviceTypeIcon";
import { useLocale } from "../../locale/LocaleContext";
import { emitDevicesChanged } from "./devicesEvents";

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

function apiBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw === "string" && raw.trim() && raw !== "undefined") {
    return raw.trim().replace(/\/$/, "");
  }
  return "http://localhost:4000";
}

/**
 * Trusted-device popup for pending remote device-recovery requests
 * (same UX pattern as DeviceApprovalController).
 */
export default function DeviceRecoveryApprovalController() {
  const enterpriseEnabled = Boolean(accountRecoveryModule.DevicesRestorePanel);
  const { t, locale } = useLocale();
  const core = useAuthenticatedCoreClient();
  const { accessToken, currentDeviceId, vaultUnlocked, vaultKey } = useAuthVault();
  const [pending, setPending] = useState<EnterpriseDeviceRecoveryRequestDto[]>([]);
  const [resolving, setResolving] = useState(false);
  /** Prevent in-flight poll from re-opening a just-resolved request. */
  const dismissedIdsRef = useRef(new Set<string>());

  const client = useMemo(() => {
    if (!accessToken || !enterpriseEnabled) {
      return null;
    }
    return new EnterpriseAccountRecoveryClient(createBearerApiClient(apiBase(), accessToken));
  }, [accessToken, enterpriseEnabled]);

  useEffect(() => {
    if (!client || !vaultUnlocked || !currentDeviceId) {
      return;
    }
    let active = true;
    const poll = async () => {
      try {
        const result = await client.listDeviceRequests("approver");
        if (active) {
          setPending(
            result.requests.filter(
              (r) => r.status === "pending" && !dismissedIdsRef.current.has(r.id),
            ),
          );
        }
      } catch {
        // Best-effort polling.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [client, currentDeviceId, vaultUnlocked]);

  const current = pending[0];
  if (!enterpriseEnabled || !current || !client || !currentDeviceId || !vaultKey) {
    return null;
  }

  const deviceHints = {
    device_name: current.deviceName,
    client_type: current.clientType,
    os_name: current.osName,
    platform: current.platform,
    user_agent: current.userAgent,
  };

  const dismissRequest = (requestId: string) => {
    dismissedIdsRef.current.add(requestId);
    setPending((items) => items.filter((item) => item.id !== requestId));
  };

  const approve = async () => {
    if (resolving) {
      return;
    }
    setResolving(true);
    try {
      const wrapBlob = await wrapVaultKeyForDeviceRequest(
        vaultKey,
        base64ToBytes(current.requestEphemeralPublicB64),
      );
      await client.approveDeviceRequest(current.id, {
        approvingDeviceId: currentDeviceId,
        wrapBlob,
      });
      dismissRequest(current.id);
      toast.success(t("account.restore.enterprise.devices.toast.approved"));
    } catch {
      toast.error(t("web.settingsPopup.recovery.error.generic"));
      setResolving(false);
    }
  };

  const reject = async () => {
    if (resolving) {
      return;
    }
    setResolving(true);
    try {
      await client.rejectDeviceRequest(current.id, currentDeviceId);
      dismissRequest(current.id);
      emitDevicesChanged();
      toast.success(t("account.restore.enterprise.devices.toast.rejected"));
    } catch {
      toast.error(t("web.settingsPopup.recovery.error.generic"));
      setResolving(false);
    }
  };

  const blockForever = async () => {
    if (!current.requestingDeviceId || !core || resolving) {
      if (!current.requestingDeviceId || !core) {
        toast.error(t("web.settingsPopup.recovery.error.generic"));
      }
      return;
    }
    setResolving(true);
    try {
      // Phase 1 Core forever-block on the requesting pending device.
      try {
        await core.blockDevice(current.requestingDeviceId, currentDeviceId, {
          duration: "forever",
        });
      } catch {
        /* Legacy requests may bind trusted id → Core 404; enterprise demotes + blocks. */
      }
      await client.blockDeviceRequest(current.id, currentDeviceId);
      dismissRequest(current.id);
      emitDevicesChanged();
      toast.success(t("web.settingsPopup.devices.toast.blocked"));
    } catch {
      toast.error(t("web.settingsPopup.recovery.error.generic"));
      setResolving(false);
    }
  };

  return (
    <Popup
      header={t("account.restore.enterprise.devices.popup.title")}
      width={520}
      closeDisabled
      closeLabel={t("web.capsules.approval.closeLabel")}
      footer={
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={resolving}
            onClick={() => void approve()}
          >
            <IconCheck16 className="size-4 shrink-0" />
            {t("account.restore.enterprise.devices.popup.approve")}
          </Button>
          <ControlGroup
            className="w-auto"
            aria-label={t("account.restore.enterprise.devices.popup.reject")}
          >
            <Button
              type="button"
              className="gap-2"
              disabled={resolving}
              onClick={() => void reject()}
            >
              <IconNotNow16 className="size-4 shrink-0" />
              {t("account.restore.enterprise.devices.popup.reject")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    buttonVariants({ variant: "default", size: "icon" }),
                    controlGroupItemFixedClassName,
                    "border-l border-primary-foreground/25",
                  )}
                  aria-label={t("account.restore.enterprise.devices.popup.blockMenu")}
                  disabled={resolving || !current.requestingDeviceId}
                >
                  <ChevronDownIcon className="size-4 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1">
                <DropdownMenuItem
                  className="gap-2"
                  disabled={resolving || !current.requestingDeviceId}
                  onSelect={() => void blockForever()}
                >
                  {t("account.restore.enterprise.devices.popup.blockForever")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ControlGroup>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-muted-foreground">{t("account.restore.enterprise.devices.popup.body")}</p>
        <div className="flex items-center gap-4 rounded-xl bg-secondary p-4">
          <DeviceTypeIcon
            form={resolveDeviceFormIcon(deviceHints)}
            brand={resolveDeviceBrandIcon(deviceHints)}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="truncate text-sm font-medium text-foreground">
              {formatDeviceTitle(deviceHints)}
            </p>
            <p className="text-sm text-muted-foreground">{formatDeviceClientOs(deviceHints)}</p>
            <p className="text-sm text-muted-foreground">
              {formatAbsoluteDate(current.createdAt, locale)}
            </p>
          </div>
          <div className="shrink-0 text-right text-[13px] leading-5 text-muted-foreground">
            <p>
              {t("web.settingsPopup.devices.pending.ip", {
                ip: current.requestIp || "unknown",
              })}
            </p>
            <p>
              {t("web.settingsPopup.devices.pending.country", {
                country: current.country || t("web.settingsPopup.devices.pending.unknownLocation"),
              })}
            </p>
            <p>
              {t("web.settingsPopup.devices.pending.city", {
                city: current.city || t("web.settingsPopup.devices.pending.unknownLocation"),
              })}
            </p>
          </div>
        </div>
      </div>
    </Popup>
  );
}
