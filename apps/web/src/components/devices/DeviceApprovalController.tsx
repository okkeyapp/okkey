import type { DeviceBlockDuration, DeviceListItemDto } from "@okkey/types";
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
import { useEffect, useMemo, useState } from "react";

import { useAuthVault, useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import { formatDeviceClientOs, formatDeviceTitle } from "../../auth/browserEnvironment";
import { getOrCreateDeviceFingerprint } from "../../auth/deviceFingerprint";
import { IconCheck16 } from "../items/itemCategoryIcons";
import {
  DeviceTypeIcon,
  resolveDeviceBrandIcon,
  resolveDeviceFormIcon,
} from "../settings/DeviceTypeIcon";
import { useLocale } from "../../locale/LocaleContext";
import { emitDevicesChanged } from "./devicesEvents";

const BLOCK_OPTIONS: Array<{ duration: DeviceBlockDuration; labelKey: string }> = [
  { duration: "1h", labelKey: "web.settingsPopup.devices.pending.block1h" },
  { duration: "1d", labelKey: "web.settingsPopup.devices.pending.block1d" },
  { duration: "1w", labelKey: "web.settingsPopup.devices.pending.block1w" },
  { duration: "forever", labelKey: "web.settingsPopup.devices.pending.blockForever" },
];

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

/**
 * Trusted-device popup for pending browser logins (no UI countdown — server TTL still applies).
 */
export default function DeviceApprovalController() {
  const { t, locale } = useLocale();
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
      emitDevicesChanged();
    } finally {
      setResolving(false);
    }
  };

  const block = async (duration: DeviceBlockDuration) => {
    setResolving(true);
    try {
      await core.blockDevice(current.device_id, currentDeviceId, { duration });
      setPending((items) => items.filter((item) => item.device_id !== current.device_id));
      emitDevicesChanged();
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
            className="gap-2"
            disabled={resolving}
            onClick={() => void resolve("approve")}
          >
            <IconCheck16 className="size-4 shrink-0" />
            {t("web.settingsPopup.devices.pending.trust")}
          </Button>
          <ControlGroup className="w-auto" aria-label={t("web.settingsPopup.devices.pending.notNow")}>
            <Button type="button" disabled={resolving} onClick={() => void resolve("reject")}>
              {t("web.settingsPopup.devices.pending.notNow")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    buttonVariants({ variant: "default", size: "icon" }),
                    controlGroupItemFixedClassName,
                  )}
                  aria-label={t("web.settingsPopup.devices.pending.blockMenu")}
                  disabled={resolving}
                >
                  <ChevronDownIcon className="size-4 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 p-1">
                {BLOCK_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.duration}
                    className="gap-2"
                    onSelect={() => void block(option.duration)}
                  >
                    {t(option.labelKey)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </ControlGroup>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-muted-foreground">{t("web.settingsPopup.devices.pending.body")}</p>
        <div className="flex items-center gap-4 rounded-xl bg-secondary p-4">
          <DeviceTypeIcon
            form={resolveDeviceFormIcon(current)}
            brand={resolveDeviceBrandIcon(current)}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="truncate text-sm font-medium text-foreground">{formatDeviceTitle(current)}</p>
            <p className="text-sm text-muted-foreground">{formatDeviceClientOs(current)}</p>
            <p className="text-sm text-muted-foreground">
              {formatAbsoluteDate(current.created_at, locale)}
            </p>
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
