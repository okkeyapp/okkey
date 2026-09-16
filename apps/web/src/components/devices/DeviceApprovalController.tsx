import type { DeviceListItemDto } from "@okkey/types";
import { Button, Popup } from "@okkey/ui";
import { useEffect, useMemo, useState } from "react";

import { useAuthVault, useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import { formatDeviceClientOs, formatDeviceTitle } from "../../auth/browserEnvironment";
import { getOrCreateDeviceFingerprint } from "../../auth/deviceFingerprint";
import {
  DeviceTypeIcon,
  resolveDeviceBrandIcon,
  resolveDeviceFormIcon,
} from "../settings/DeviceTypeIcon";
import { useLocale } from "../../locale/LocaleContext";

/**
 * Trusted-device popup for pending browser logins (no UI countdown — server TTL still applies).
 */
export default function DeviceApprovalController() {
  const { t } = useLocale();
  const core = useAuthenticatedCoreClient();
  const { currentDeviceId, vaultUnlocked } = useAuthVault();
  const [pending, setPending] = useState<DeviceListItemDto[]>([]);
  const [resolving, setResolving] = useState(false);
  const fingerprint = useMemo(() => getOrCreateDeviceFingerprint(), []);
  const current = pending[0];

  useEffect(() => {
    if (!core || !vaultUnlocked || !currentDeviceId) {
      return;
    }
    let active = true;
    const poll = async () => {
      try {
        const result = await core.listDevices(fingerprint);
        if (active) {
          setPending(result.pending);
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
  }, [core, currentDeviceId, fingerprint, vaultUnlocked]);

  if (!current || !core || !currentDeviceId) {
    return null;
  }

  const resolve = async (decision: "approve" | "reject") => {
    setResolving(true);
    try {
      if (decision === "approve") {
        await core.approveDevice(current.device_id, currentDeviceId);
      } else {
        await core.rejectDevice(current.device_id, currentDeviceId, "dismissed by user");
      }
      setPending((items) => items.filter((item) => item.device_id !== current.device_id));
    } finally {
      setResolving(false);
    }
  };

  return (
    <Popup
      header={t("web.settingsPopup.devices.pending.title")}
      width={520}
      closeDisabled
      closeLabel={t("web.capsules.approval.closeLabel")}
      footer={
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={resolving}
            onClick={() => void resolve("approve")}
          >
            {t("web.settingsPopup.devices.pending.trust")}
          </Button>
          <Button type="button" disabled={resolving} onClick={() => void resolve("reject")}>
            {t("web.settingsPopup.devices.pending.notNow")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-muted-foreground">{t("web.settingsPopup.devices.pending.body")}</p>
        <div className="flex items-center gap-4 rounded-xl bg-background p-4">
          <DeviceTypeIcon
            form={resolveDeviceFormIcon(current)}
            brand={resolveDeviceBrandIcon(current)}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="truncate text-sm font-medium text-foreground">{formatDeviceTitle(current)}</p>
            <p className="text-sm text-muted-foreground">{formatDeviceClientOs(current)}</p>
          </div>
          <div className="shrink-0 text-right text-[13px] leading-5 text-muted-foreground">
            <p>
              {t("web.settingsPopup.devices.pending.ip", {
                ip: current.ip_address || "unknown",
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
