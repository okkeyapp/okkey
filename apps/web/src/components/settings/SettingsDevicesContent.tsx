import { ApiRequestError } from "@okkey/api";
import type { WebMessageValues } from "@okkey/i18n";
import type { DeviceBlockDuration, DeviceListItemDto } from "@okkey/types";
import {
  Button,
  ControlGroup,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Popup,
  Skeleton,
  buttonVariants,
  controlGroupItemFixedClassName,
  cn,
} from "@okkey/ui";
import { ChevronDownIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useAuthenticatedCoreClient, useAuthVault } from "../../auth/AuthVaultContext";
import { formatDeviceClientOs, formatDeviceTitle } from "../../auth/browserEnvironment";
import { getOrCreateDeviceFingerprint } from "../../auth/deviceFingerprint";
import ListScrollSentinel from "../../lists/ListScrollSentinel";
import { useListWindow } from "../../lists/useListWindow";
import {
  IconActions16,
  IconCheck16,
  IconDelete16,
  IconEdit16,
  IconNotNow16,
  IconUnlock16,
} from "../items/itemCategoryIcons";
import { calendarDaysBetween } from "../../lib/calendarDaysBetween";
import { useLocale } from "../../locale/LocaleContext";
import { DEVICES_CHANGED_EVENT, emitDevicesChanged } from "../devices/devicesEvents";
import {
  DeviceTypeIcon,
  resolveDeviceBrandIcon,
  resolveDeviceFormIcon,
} from "./DeviceTypeIcon";
import { useSettingsPopupCacheEntry } from "./useSettingsPopupCache";

type SettingsDevicesContentProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
};

const BLOCK_OPTIONS: Array<{ duration: DeviceBlockDuration; labelKey: string }> = [
  { duration: "1h", labelKey: "web.settingsPopup.devices.pending.block1h" },
  { duration: "1d", labelKey: "web.settingsPopup.devices.pending.block1d" },
  { duration: "forever", labelKey: "web.settingsPopup.devices.pending.blockForever" },
];

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

/** Re-export for existing tests. */
export { parseOsFromDeviceName } from "../../auth/browserEnvironment";

export default function SettingsDevicesContent({ t }: SettingsDevicesContentProps) {
  const core = useAuthenticatedCoreClient();
  const { currentDeviceId: sessionDeviceId } = useAuthVault();
  const { locale } = useLocale();
  const fingerprint = useMemo(() => getOrCreateDeviceFingerprint(), []);
  const mapDevicesError = useCallback((err: unknown) => devicesErrorMessage(err, t), [t]);
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
  const {
    data: devicesCache,
    error,
    needsSkeleton: initialLoading,
    setData: setDevicesCache,
    refresh,
  } = useSettingsPopupCacheEntry("devices", ensureDevices, mapDevicesError);

  const devices = devicesCache?.devices ?? [];
  const pending = devicesCache?.pending ?? [];
  const blocked = devicesCache?.blocked ?? [];

  const [blockedOpen, setBlockedOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<DeviceListItemDto | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      await refresh({ quiet: opts?.quiet });
    },
    [refresh],
  );

  useEffect(() => {
    const onChanged = () => {
      void load({ quiet: true });
    };
    window.addEventListener(DEVICES_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(DEVICES_CHANGED_EVENT, onChanged);
  }, [load]);

  const patchDevicesCache = useCallback(
    (patch: {
      devices?: DeviceListItemDto[];
      pending?: DeviceListItemDto[];
      blocked?: DeviceListItemDto[];
    }) => {
      setDevicesCache({
        devices: patch.devices ?? devices,
        pending: patch.pending ?? pending,
        blocked: patch.blocked ?? blocked,
      });
    },
    [blocked, devices, pending, setDevicesCache],
  );

  const isCurrentDevice = useCallback(
    (device: DeviceListItemDto) => {
      if (device.is_current) {
        return true;
      }
      if (sessionDeviceId && device.device_id === sessionDeviceId) {
        return true;
      }
      return device.device_fingerprint.toLowerCase() === fingerprint.toLowerCase();
    },
    [fingerprint, sessionDeviceId],
  );

  const currentDeviceId = useMemo(
    () => devices.find((device) => isCurrentDevice(device))?.device_id ?? null,
    [devices, isCurrentDevice],
  );

  const primaryPending = pending[0] ?? null;

  const {
    visibleCount: visibleDevicesCount,
    hasMore: devicesHasMore,
    loadMore: loadMoreDevices,
  } = useListWindow({
    total: devices.length,
    resetKey: "devices-trusted",
  });
  const visibleDevices = devices.slice(0, visibleDevicesCount);

  const {
    visibleCount: visibleBlockedCount,
    hasMore: blockedHasMore,
    loadMore: loadMoreBlocked,
  } = useListWindow({
    total: blocked.length,
    resetKey: blockedOpen ? "devices-blocked-open" : "devices-blocked-closed",
  });
  const visibleBlocked = blocked.slice(0, visibleBlockedCount);

  const dismissPending = useCallback(
    async (deviceId: string, reason: string) => {
      if (!core || busyId) {
        return;
      }
      setBusyId(deviceId);
      try {
        if (currentDeviceId) {
          await core.rejectDevice(deviceId, currentDeviceId, reason);
        } else {
          await core.revokeDevice(deviceId, reason);
        }
        patchDevicesCache({
          pending: pending.filter((item) => item.device_id !== deviceId),
        });
        toast.success(t("web.settingsPopup.devices.toast.revoked"));
        emitDevicesChanged();
        await load({ quiet: true });
      } catch (err) {
        toast.error(devicesErrorMessage(err, t));
      } finally {
        setBusyId(null);
      }
    },
    [busyId, core, currentDeviceId, load, patchDevicesCache, pending, t],
  );

  const blockPending = useCallback(
    async (device: DeviceListItemDto, duration: DeviceBlockDuration) => {
      if (!core || !currentDeviceId || busyId) {
        toast.error(t("web.settingsPopup.devices.error.accessDenied"));
        return;
      }
      setBusyId(device.device_id);
      try {
        const result = await core.blockDevice(device.device_id, currentDeviceId, {
          duration,
        });
        patchDevicesCache({
          pending: pending.filter((item) => item.device_id !== device.device_id),
          blocked: [
            {
              ...device,
              status: "blocked",
              blocked_until: result.blocked_until,
              approval_expires_at: null,
            },
            ...blocked.filter((item) => item.device_id !== device.device_id),
          ],
        });
        toast.success(t("web.settingsPopup.devices.toast.blocked"));
        emitDevicesChanged();
        await load({ quiet: true });
      } catch (err) {
        toast.error(devicesErrorMessage(err, t));
      } finally {
        setBusyId(null);
      }
    },
    [blocked, busyId, core, currentDeviceId, load, patchDevicesCache, pending, t],
  );

  const trustPending = async (device: DeviceListItemDto) => {
    if (!core || !currentDeviceId) {
      toast.error(t("web.settingsPopup.devices.error.accessDenied"));
      return;
    }
    setBusyId(device.device_id);
    // Optimistic: move into trusted list immediately.
    patchDevicesCache({
      pending: pending.filter((item) => item.device_id !== device.device_id),
      devices: [
        { ...device, status: "trusted", is_current: false, approval_expires_at: null },
        ...devices.filter((item) => item.device_id !== device.device_id),
      ],
    });
    try {
      await core.approveDevice(device.device_id, currentDeviceId);
      toast.success(t("web.settingsPopup.devices.toast.trusted"));
      emitDevicesChanged();
      await load({ quiet: true });
    } catch (err) {
      toast.error(devicesErrorMessage(err, t));
      await load({ quiet: true });
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
      patchDevicesCache({
        devices: devices.filter((item) => item.device_id !== deviceId),
      });
      toast.success(t("web.settingsPopup.devices.toast.revoked"));
      emitDevicesChanged();
      await load({ quiet: true });
    } catch (err) {
      toast.error(devicesErrorMessage(err, t));
    } finally {
      setBusyId(null);
    }
  };

  const unblockDevice = async (deviceId: string, trust: boolean) => {
    if (!core) {
      return;
    }
    setBusyId(deviceId);
    try {
      const result = await core.unblockDevice(deviceId, { trust });
      patchDevicesCache({
        blocked: blocked.filter((item) => item.device_id !== deviceId),
      });
      if (result.status === "trusted") {
        toast.success(t("web.settingsPopup.devices.toast.trusted"));
      } else {
        toast.success(t("web.settingsPopup.devices.toast.unblocked"));
      }
      emitDevicesChanged();
      await load({ quiet: true });
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
      await load({ quiet: true });
    } catch (err) {
      toast.error(devicesErrorMessage(err, t));
    } finally {
      setBusyId(null);
    }
  };

  if (error && !initialLoading && devices.length === 0 && pending.length === 0) {
    return (
      <div className="flex min-h-[420px] flex-col items-start gap-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" variant="secondary" onClick={() => void load()}>
          {t("web.settingsPopup.devices.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[420px] flex-col gap-4 pb-1"
      aria-busy={initialLoading || undefined}
      aria-label={t("web.settingsPopup.devices.title")}
    >
      <p className="text-sm text-muted-foreground">{t("web.settingsPopup.devices.description")}</p>

      {error && !initialLoading ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      {initialLoading ? (
        <div className="flex flex-col" role="status" aria-label={t("web.settingsPopup.devices.loading")}>
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={`device-skeleton-${index}`}
              className={
                index === 0
                  ? "flex items-start gap-4 py-4"
                  : "flex items-start gap-4 border-t border-border py-4"
              }
            >
              <Skeleton className="size-10 shrink-0 rounded-md" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-5 w-40 max-w-[55%]" />
                <Skeleton className="h-5 w-28 max-w-[40%]" />
                <div className="space-y-1 pt-1.5">
                  <Skeleton className="h-4 w-36 max-w-[50%]" />
                  <Skeleton className="h-4 w-32 max-w-[45%]" />
                </div>
              </div>
              <Skeleton className="size-8 shrink-0 rounded-md" />
            </div>
          ))}
        </div>
      ) : (
        <>
      {primaryPending ? (
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
                {formatDeviceTitle(primaryPending)}
              </p>
              <p className="text-sm text-muted-foreground">{formatDeviceClientOs(primaryPending)}</p>
              <p className="text-sm text-muted-foreground">
                {formatAbsoluteDate(primaryPending.created_at, locale)}
              </p>
            </div>
            <div className="shrink-0 text-right text-[13px] leading-5 text-muted-foreground">
              <p>
                {t("web.settingsPopup.devices.pending.ip", {
                  ip: primaryPending.ip_address || "unknown",
                })}
              </p>
              <p>
                {t("web.settingsPopup.devices.pending.country", {
                  country:
                    primaryPending.country ||
                    t("web.settingsPopup.devices.pending.unknownLocation"),
                })}
              </p>
              <p>
                {t("web.settingsPopup.devices.pending.city", {
                  city:
                    primaryPending.city || t("web.settingsPopup.devices.pending.unknownLocation"),
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              className="gap-2"
              disabled={busyId === primaryPending.device_id}
              onClick={() => void trustPending(primaryPending)}
            >
              <IconCheck16 className="size-4 shrink-0" />
              {t("web.settingsPopup.devices.pending.trust")}
            </Button>
            <ControlGroup className="w-auto" aria-label={t("web.settingsPopup.devices.pending.notNow")}>
              <Button
                type="button"
                className="gap-2"
                disabled={busyId === primaryPending.device_id}
                onClick={() =>
                  void dismissPending(primaryPending.device_id, "dismissed by user")
                }
              >
                <IconNotNow16 className="size-4 shrink-0" />
                {t("web.settingsPopup.devices.pending.notNow")}
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
                    aria-label={t("web.settingsPopup.devices.pending.blockMenu")}
                    disabled={busyId === primaryPending.device_id}
                  >
                    <ChevronDownIcon className="size-4 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 p-1">
                  {BLOCK_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.duration}
                      className="gap-2"
                      onSelect={() => void blockPending(primaryPending, option.duration)}
                    >
                      {t(option.labelKey)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </ControlGroup>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col">
        {devices.length === 0 && !primaryPending ? (
          <p className="py-8 text-sm text-muted-foreground">
            {t("web.settingsPopup.devices.empty")}
          </p>
        ) : null}
        {visibleDevices.map((device, index) => {
          const form = resolveDeviceFormIcon(device);
          const brand = resolveDeviceBrandIcon(device);
          const current = isCurrentDevice(device);
          return (
            <div
              key={device.device_id}
              className={
                index === 0
                  ? "flex items-start gap-4 py-4"
                  : "flex items-start gap-4 border-t border-border py-4"
              }
            >
              <DeviceTypeIcon form={form} brand={brand} />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground">
                    {formatDeviceTitle(device)}
                  </p>
                  {current ? (
                    <span className="shrink-0 rounded-full bg-secondary px-2 text-xs leading-5 text-foreground">
                      {t("web.settingsPopup.devices.list.currentBadge")}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">{formatDeviceClientOs(device)}</p>
                <div className="pt-1.5 text-[13px] leading-5 text-muted-foreground">
                  <p>{formatAddedLabel(device.created_at, locale, t)}</p>
                  <p>{formatLastActiveLabel(device.last_seen_at, locale, t)}</p>
                </div>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="iconSm"
                      className="shrink-0"
                      aria-label={t("web.settingsPopup.devices.actions.menu")}
                      disabled={busyId === device.device_id}
                    >
                      <IconActions16 className="size-4 text-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 p-1">
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        className="gap-2"
                        onSelect={() => {
                          setRenameTarget(device);
                          setRenameValue(device.device_name);
                        }}
                      >
                        <IconEdit16 className="size-4 shrink-0" />
                        <span>{t("web.settingsPopup.devices.actions.rename")}</span>
                      </DropdownMenuItem>
                      {!current ? (
                        <DropdownMenuItem
                          className="gap-2 text-destructive data-[highlighted]:bg-destructive/15 data-[highlighted]:text-destructive"
                          onSelect={() => void revokeTrusted(device.device_id)}
                        >
                          <IconDelete16 className="size-4 shrink-0" />
                          <span>{t("web.settingsPopup.devices.actions.revoke")}</span>
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
        {devicesHasMore ? <ListScrollSentinel onVisible={loadMoreDevices} /> : null}
      </div>
        </>
      )}

      {!initialLoading ? (
      <div className="flex flex-col gap-2">
        {blocked.length > 0 ? (
          <>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => setBlockedOpen((value) => !value)}
            >
              {t("web.settingsPopup.devices.blocked.toggle")}
              <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold leading-none text-primary-foreground">
                {blocked.length}
              </span>
              <ChevronDownIcon
                data-icon="inline-end"
                className={blockedOpen ? "rotate-180" : undefined}
              />
            </Button>
            {blockedOpen ? (
              <div className="overflow-hidden rounded-xl bg-secondary">
                {visibleBlocked.map((device, index) => (
                  <div
                    key={device.device_id}
                    className={
                      index === 0
                        ? "flex items-start gap-4 p-4"
                        : "flex items-start gap-4 border-t border-border p-4"
                    }
                  >
                    <DeviceTypeIcon
                      form={resolveDeviceFormIcon(device)}
                      brand={resolveDeviceBrandIcon(device)}
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="truncate text-sm font-medium text-foreground">
                        {formatDeviceTitle(device)}
                      </p>
                      <p className="text-sm text-muted-foreground">{formatDeviceClientOs(device)}</p>
                      <p className="text-sm text-muted-foreground">
                        {device.blocked_until
                          ? t("web.settingsPopup.devices.blocked.until", {
                              date: formatAbsoluteDate(device.blocked_until, locale),
                            })
                          : t("web.settingsPopup.devices.blocked.forever")}
                      </p>
                    </div>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="iconSm"
                            className="hover:bg-background data-[state=open]:bg-background"
                            aria-label={t("web.settingsPopup.devices.actions.menu")}
                            disabled={busyId === device.device_id}
                          >
                            <IconActions16 className="size-4 text-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 p-1">
                          <DropdownMenuItem
                            className="gap-2"
                            onSelect={() => void unblockDevice(device.device_id, false)}
                          >
                            <IconUnlock16 className="size-4 shrink-0" />
                            {t("web.settingsPopup.devices.actions.unblock")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="gap-2"
                            onSelect={() => void unblockDevice(device.device_id, true)}
                          >
                            <IconCheck16 className="size-4 shrink-0" />
                            {t("web.settingsPopup.devices.actions.unblockAndTrust")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
                {blockedHasMore ? <ListScrollSentinel onVisible={loadMoreBlocked} /> : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      ) : null}

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
