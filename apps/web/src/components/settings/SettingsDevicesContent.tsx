import { ApiRequestError } from "@okkey/api";
import type { WebMessageValues } from "@okkey/i18n";
import type { DeviceListItemDto } from "@okkey/types";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Popup,
} from "@okkey/ui";
import { EllipsisVertical } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import { getOrCreateDeviceFingerprint } from "../../auth/deviceFingerprint";
import { calendarDaysBetween } from "../../lib/calendarDaysBetween";
import { useLocale } from "../../locale/LocaleContext";
import {
  DeviceTypeIcon,
  resolveDeviceBrandIcon,
  resolveDeviceFormIcon,
} from "./DeviceTypeIcon";

/** UI auto-reject countdown for pending banner (product / Figma). */
export const PENDING_UI_COUNTDOWN_SECONDS = 60;

type SettingsDevicesContentProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
};

function devicesErrorMessage(
  err: unknown,
  t: SettingsDevicesContentProps["t"],
): string {
  if (err instanceof ApiRequestError) {
    switch (err.body.error) {
      case "DEVICE_NOT_FOUND":
      case "DEVICE_APPROVAL_NOT_FOUND":
        return t("web.settingsPopup.devices.error.notFound");
      case "DEVICE_APPROVAL_ACCESS_DENIED":
        return t("web.settingsPopup.devices.error.accessDenied");
      case "DEVICE_APPROVAL_EXPIRED":
        return t("web.settingsPopup.devices.error.expired");
      default:
        return t("web.settingsPopup.devices.error.generic");
    }
  }
  return t("web.settingsPopup.devices.error.generic");
}

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

function formatAddedLabel(
  iso: string,
  locale: string,
  t: SettingsDevicesContentProps["t"],
): string {
  const absolute = formatAbsoluteDate(iso, locale);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return t("web.settingsPopup.devices.list.added", { date: absolute });
  }
  const days = Math.max(0, calendarDaysBetween(date));
  if (days === 0) {
    return t("web.settingsPopup.devices.list.addedToday", { date: absolute });
  }
  if (days === 1) {
    return t("web.settingsPopup.devices.list.addedYesterday", { date: absolute });
  }
  return t("web.settingsPopup.devices.list.addedAgo", {
    date: absolute,
    days: String(days),
  });
}

function formatLastActiveLabel(
  iso: string | null,
  locale: string,
  t: SettingsDevicesContentProps["t"],
): string {
  if (!iso) {
    return t("web.settingsPopup.devices.list.lastActiveUnknown");
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return t("web.settingsPopup.devices.list.lastActiveUnknown");
  }
  const absolute = formatAbsoluteDate(iso, locale);
  const days = Math.max(0, calendarDaysBetween(date));
  const ageMs = Date.now() - date.getTime();
  if (days === 0 && ageMs < 2 * 60 * 1000) {
    return t("web.settingsPopup.devices.list.lastActiveJustNow");
  }
  if (days === 0) {
    return t("web.settingsPopup.devices.list.lastActiveToday", { date: absolute });
  }
  if (days === 1) {
    return t("web.settingsPopup.devices.list.lastActiveYesterday", { date: absolute });
  }
  return t("web.settingsPopup.devices.list.lastActiveAgo", {
    date: absolute,
    days: String(days),
  });
}

function formatClientOs(device: DeviceListItemDto): string {
  const client = formatClientLabel(device.client_type);
  const os = device.os_name && device.os_name !== "unknown" ? device.os_name : device.platform;
  return `${client} · ${os}`;
}

function formatClientLabel(clientType: string): string {
  const value = clientType.trim().toLowerCase();
  if (!value || value === "unknown") return "App";
  if (value.includes("extension")) return "Chrome extension";
  if (value === "web" || value.includes("browser")) return "Chrome";
  if (value.includes("mobile")) return "App";
  if (value.includes("desktop")) return "App";
  return clientType;
}

function remainingUiSeconds(approvalExpiresAt: string | null, nowMs: number): number {
  if (!approvalExpiresAt) {
    return PENDING_UI_COUNTDOWN_SECONDS;
  }
  const serverRemaining = Math.max(
    0,
    Math.ceil((new Date(approvalExpiresAt).getTime() - nowMs) / 1000),
  );
  return Math.min(PENDING_UI_COUNTDOWN_SECONDS, serverRemaining);
}

function CountdownRing({ progress }: { progress: number }) {
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, progress)));
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 8 8)"
      />
    </svg>
  );
}

export default function SettingsDevicesContent({ t }: SettingsDevicesContentProps) {
  const core = useAuthenticatedCoreClient();
  const { locale } = useLocale();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceListItemDto[]>([]);
  const [pending, setPending] = useState<DeviceListItemDto[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<DeviceListItemDto | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const autoRejectingRef = useRef<string | null>(null);

  const fingerprint = useMemo(() => getOrCreateDeviceFingerprint(), []);

  const load = useCallback(async () => {
    if (!core) {
      setLoading(false);
      setError(t("web.settingsPopup.devices.error.generic"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await core.listDevices(fingerprint);
      setDevices(result.devices);
      setPending(result.pending);
    } catch (err) {
      setError(devicesErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  }, [core, fingerprint, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (pending.length === 0) {
      return;
    }
    const timer = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [pending.length]);

  const currentDeviceId = useMemo(
    () => devices.find((device) => device.is_current)?.device_id ?? null,
    [devices],
  );

  const primaryPending = pending[0] ?? null;
  const countdownSeconds = primaryPending
    ? remainingUiSeconds(primaryPending.approval_expires_at, nowMs)
    : 0;

  const dismissPending = useCallback(
    async (deviceId: string, reason: string) => {
      if (!core || busyId) {
        return;
      }
      setBusyId(deviceId);
      try {
        await core.revokeDevice(deviceId, reason);
        toast.success(t("web.settingsPopup.devices.toast.revoked"));
        await load();
      } catch (err) {
        toast.error(devicesErrorMessage(err, t));
      } finally {
        setBusyId(null);
        autoRejectingRef.current = null;
      }
    },
    [busyId, core, load, t],
  );

  useEffect(() => {
    if (!primaryPending || countdownSeconds > 0) {
      return;
    }
    if (autoRejectingRef.current === primaryPending.device_id) {
      return;
    }
    autoRejectingRef.current = primaryPending.device_id;
    void dismissPending(primaryPending.device_id, "auto-rejected after timeout");
  }, [countdownSeconds, dismissPending, primaryPending]);

  const trustPending = async (deviceId: string) => {
    if (!core || !currentDeviceId) {
      toast.error(t("web.settingsPopup.devices.error.accessDenied"));
      return;
    }
    setBusyId(deviceId);
    try {
      await core.approveDevice(deviceId, currentDeviceId);
      toast.success(t("web.settingsPopup.devices.toast.trusted"));
      await load();
    } catch (err) {
      toast.error(devicesErrorMessage(err, t));
    } finally {
      setBusyId(null);
    }
  };

  const revokeTrusted = async (deviceId: string) => {
    if (!core) {
      return;
    }
    setBusyId(deviceId);
    try {
      await core.revokeDevice(deviceId, "revoked from settings");
      toast.success(t("web.settingsPopup.devices.toast.revoked"));
      await load();
    } catch (err) {
      toast.error(devicesErrorMessage(err, t));
    } finally {
      setBusyId(null);
    }
  };

  const submitRename = async () => {
    if (!core || !renameTarget) {
      return;
    }
    const nextName = renameValue.trim();
    if (!nextName) {
      return;
    }
    setBusyId(renameTarget.device_id);
    try {
      await core.patchDevice(renameTarget.device_id, { device_name: nextName });
      toast.success(t("web.settingsPopup.devices.toast.renamed"));
      setRenameTarget(null);
      await load();
    } catch (err) {
      toast.error(devicesErrorMessage(err, t));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[min(420px,calc(100dvh-32px))] items-center justify-center p-4 text-sm text-muted-foreground">
        {t("web.settingsPopup.devices.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[min(420px,calc(100dvh-32px))] flex-col items-start gap-3 p-4">
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" variant="secondary" onClick={() => void load()}>
          {t("web.settingsPopup.devices.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[min(420px,calc(100dvh-32px))] flex-col gap-4 pb-4">
      <p className="px-4 text-sm text-muted-foreground">
        {t("web.settingsPopup.devices.description")}
      </p>

      {primaryPending ? (
        <div className="px-4">
          <div className="flex flex-col gap-4 rounded-xl bg-secondary p-4">
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-foreground">
                {t("web.settingsPopup.devices.pending.title")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("web.settingsPopup.devices.pending.body")}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <DeviceTypeIcon
                form={resolveDeviceFormIcon(primaryPending)}
                brand={resolveDeviceBrandIcon(primaryPending)}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="truncate text-sm font-medium text-foreground">
                  {primaryPending.device_name}
                </p>
                <p className="text-sm text-muted-foreground">{formatClientOs(primaryPending)}</p>
              </div>
              <div className="shrink-0 text-right text-[13px] leading-5 text-muted-foreground">
                <p>
                  {t("web.settingsPopup.devices.pending.ip", {
                    ip: primaryPending.ip_address || "unknown",
                  })}
                </p>
                {primaryPending.city || primaryPending.country ? (
                  <p>
                    {[primaryPending.city, primaryPending.country].filter(Boolean).join(", ")}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busyId === primaryPending.device_id}
                onClick={() => void trustPending(primaryPending.device_id)}
              >
                {t("web.settingsPopup.devices.pending.trust")}
              </Button>
              <Button
                type="button"
                disabled={busyId === primaryPending.device_id}
                onClick={() =>
                  void dismissPending(primaryPending.device_id, "dismissed by user")
                }
              >
                <span>{t("web.settingsPopup.devices.pending.notNow")}</span>
                <span className="inline-flex items-center gap-1">
                  <span>{countdownSeconds}</span>
                  <CountdownRing progress={countdownSeconds / PENDING_UI_COUNTDOWN_SECONDS} />
                </span>
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col px-4">
        {devices.length === 0 && !primaryPending ? (
          <p className="py-8 text-sm text-muted-foreground">
            {t("web.settingsPopup.devices.empty")}
          </p>
        ) : null}
        {devices.map((device, index) => {
          const form = resolveDeviceFormIcon(device);
          const brand = resolveDeviceBrandIcon(device);
          return (
            <div
              key={device.device_id}
              className={
                index === 0
                  ? "flex items-center gap-4 overflow-clip py-4"
                  : "flex items-center gap-4 overflow-clip border-t border-border py-4"
              }
            >
              <DeviceTypeIcon form={form} brand={brand} />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2.5">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {device.device_name}
                  </p>
                  {device.is_current ? (
                    <span className="shrink-0 rounded-full bg-secondary px-2 text-xs leading-5 text-foreground">
                      {t("web.settingsPopup.devices.list.currentBadge")}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">{formatClientOs(device)}</p>
                <div className="pt-1.5 text-[13px] leading-5 text-muted-foreground">
                  <p>{formatAddedLabel(device.created_at, locale, t)}</p>
                  <p>{formatLastActiveLabel(device.last_seen_at, locale, t)}</p>
                </div>
              </div>
              {!device.is_current ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0"
                      aria-label={t("web.settingsPopup.devices.actions.menu")}
                      disabled={busyId === device.device_id}
                    >
                      <EllipsisVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setRenameTarget(device);
                        setRenameValue(device.device_name);
                      }}
                    >
                      {t("web.settingsPopup.devices.actions.rename")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => void revokeTrusted(device.device_id)}
                    >
                      {t("web.settingsPopup.devices.actions.revoke")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          );
        })}
      </div>

      {renameTarget ? (
        <Popup
          id="settings-devices-rename"
          width={420}
          header={t("web.settingsPopup.devices.rename.title")}
          closeLabel={t("web.settingsPopup.close")}
          onClose={() => setRenameTarget(null)}
        >
          <div className="flex flex-col gap-4 p-4">
            <Input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              aria-label={t("web.settingsPopup.devices.rename.title")}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setRenameTarget(null)}>
                {t("web.settingsPopup.devices.rename.cancel")}
              </Button>
              <Button
                type="button"
                disabled={!renameValue.trim() || busyId === renameTarget.device_id}
                onClick={() => void submitRename()}
              >
                {t("web.settingsPopup.devices.rename.save")}
              </Button>
            </div>
          </div>
        </Popup>
      ) : null}
    </div>
  );
}
