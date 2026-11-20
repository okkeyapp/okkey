import type { DeviceBlockDuration, DeviceListItemDto } from "@okkey/types";
import { intlLocaleTag } from "@okkey/i18n";
import {
  Button,
  ControlGroup,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popup,
  Spinner,
  buttonVariants,
  cn,
  controlGroupItemFixedClassName,
} from "@okkey/ui";
import { ApiRequestError } from "@okkey/api";
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useAuthVault, useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import { replacementDeviceShareForApproval } from "../../auth/approveDeviceShare";
import { sealLocalShareForPendingDevice } from "../../auth/deviceShareDelivery";
import { readVaultBundle } from "../../auth/localVaultBundle";
import { formatDeviceClientOs, formatDeviceTitle } from "../../auth/browserEnvironment";
import { getOrCreateDeviceFingerprint } from "../../auth/deviceFingerprint";
import { IconCheck16, IconNotNow16 } from "../items/itemCategoryIcons";
import {
  resolveDeviceBrandIcon,
  resolveDeviceFormIcon,
} from "../settings/DeviceTypeIcon";
import PendingDeviceInfoCard from "./PendingDeviceInfoCard";
import { useLocale } from "../../locale/LocaleContext";
import {
  refreshSettingsDevicesCache,
  setSettingsPopupCacheData,
} from "../settings/settingsPopupCache";
import { emitDevicesChanged, DEVICES_CHANGED_EVENT } from "./devicesEvents";
import {
  approvalResponseCompletesApproverAction,
  approvalResponseGrantsTrust,
  deviceDecisionToastKey,
  pendingApprovalKey,
  visiblePendingDevices,
} from "./deviceApprovalPopup";

const BLOCK_OPTIONS: Array<{ duration: DeviceBlockDuration; labelKey: string }> = [
  { duration: "1h", labelKey: "web.settingsPopup.devices.pending.block1h" },
  { duration: "1d", labelKey: "web.settingsPopup.devices.pending.block1d" },
  { duration: "forever", labelKey: "web.settingsPopup.devices.pending.blockForever" },
];

function formatAbsoluteDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(intlLocaleTag(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Stale id / already-resolved races: treat as success so first click does not toast an error. */
function isBenignApprovalRace(err: unknown): boolean {
  if (!(err instanceof ApiRequestError)) {
    return false;
  }
  const code = err.body.error;
  return (
    code === "DEVICE_APPROVAL_NOT_FOUND" ||
    code === "DEVICE_NOT_FOUND" ||
    code === "DEVICE_APPROVAL_ALREADY_RESOLVED" ||
    code === "DEVICE_APPROVAL_EXPIRED"
  );
}

/**
 * Trusted-device popup for pending browser logins (no UI countdown — server TTL still applies).
 */
export default function DeviceApprovalController() {
  const { t, locale } = useLocale();
  const core = useAuthenticatedCoreClient();
  const { currentDeviceId, vaultUnlocked, userId } = useAuthVault();
  const [pending, setPending] = useState<DeviceListItemDto[]>([]);
  const [resolving, setResolving] = useState(false);
  const fingerprint = useMemo(() => getOrCreateDeviceFingerprint(), []);
  const dismissedRequestKeysRef = useRef(new Set<string>());
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
          setSettingsPopupCacheData("devices", {
            devices: result.devices,
            pending: result.pending,
            blocked: result.blocked ?? [],
          });
          setPending(visiblePendingDevices(result.pending, dismissedRequestKeysRef.current));
        }
      } catch {
        // Best-effort polling.
      }
    };
    const onDevicesChanged = () => {
      void poll();
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5_000);
    window.addEventListener(DEVICES_CHANGED_EVENT, onDevicesChanged);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener(DEVICES_CHANGED_EVENT, onDevicesChanged);
    };
  }, [core, currentDeviceId, fingerprint, vaultUnlocked]);

  if (!current || !core || !currentDeviceId) {
    return null;
  }

  const dismissDevice = (item: Pick<DeviceListItemDto, "device_id" | "created_at">) => {
    const key = pendingApprovalKey(item);
    dismissedRequestKeysRef.current.add(key);
    setPending((items) => items.filter((row) => pendingApprovalKey(row) !== key));
  };

  const resolve = async (decision: "approve" | "reject") => {
    if (resolving) {
      return;
    }
    const targetDeviceId = current.device_id;
    const approverId = currentDeviceId;
    setResolving(true);
    try {
      if (decision === "approve") {
        const bundle = userId ? readVaultBundle(userId) : null;
        const envelope = userId
          ? await sealLocalShareForPendingDevice({
              userId,
              deviceId: current.device_id,
              oneTimeX25519PublicKey: current.one_time_x25519_public_key,
              oneTimeMlkemPublicKey: current.one_time_mlkem_public_key,
            })
          : null;
        let deviceShareB64: string | undefined;
        if (!envelope) {
          if (!userId || !bundle?.device_share_b64) {
            throw new Error("pending device has no share wrap keys");
          }
          deviceShareB64 = await replacementDeviceShareForApproval({
            userId,
            localShareB64: bundle.device_share_b64,
            pending: current,
          });
        }
        const approved = await core.approveDevice(
          targetDeviceId,
          approverId,
          envelope ?? undefined,
          deviceShareB64,
        );
        if (!approvalResponseCompletesApproverAction(approved.status)) {
          toast.error(t("web.settingsPopup.devices.error.generic"));
          return;
        }
        dismissDevice(current);
        await refreshSettingsDevicesCache(() => core.listDevices(fingerprint));
        emitDevicesChanged();
        toast.success(
          t(
            deviceDecisionToastKey("approve", {
              waitingForExtension: !approvalResponseGrantsTrust(approved.status),
            }),
          ),
        );
        return;
      }
      await core.rejectDevice(targetDeviceId, approverId, "dismissed by user");
      toast.success(t(deviceDecisionToastKey("reject")));
      dismissDevice(current);
      await refreshSettingsDevicesCache(() => core.listDevices(fingerprint));
      emitDevicesChanged();
    } catch (err) {
      if (isBenignApprovalRace(err)) {
        dismissDevice(current);
        await refreshSettingsDevicesCache(() => core.listDevices(fingerprint));
        emitDevicesChanged();
        toast.success(t(deviceDecisionToastKey(decision)));
      } else {
        toast.error(t("web.settingsPopup.devices.error.generic"));
      }
    } finally {
      setResolving(false);
    }
  };

  const block = async (duration: DeviceBlockDuration) => {
    if (resolving) {
      return;
    }
    const targetDeviceId = current.device_id;
    const approverId = currentDeviceId;
    setResolving(true);
    try {
      await core.blockDevice(targetDeviceId, approverId, { duration });
      dismissDevice(current);
      emitDevicesChanged();
      toast.success(t("web.settingsPopup.devices.toast.blocked"));
    } catch (err) {
      if (isBenignApprovalRace(err)) {
        dismissDevice(current);
        emitDevicesChanged();
        toast.success(t("web.settingsPopup.devices.toast.blocked"));
      } else {
        toast.error(t("web.settingsPopup.devices.error.generic"));
      }
    } finally {
      setResolving(false);
    }
  };

  return (
    <Popup
      header={t("web.settingsPopup.devices.pending.title")}
      width={520}
      closeDisabled
      closeOnEscape={false}
      closeLabel={t("web.capsules.approval.closeLabel")}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            className="gap-2 max-sm:w-full"
            disabled={resolving}
            aria-busy={resolving}
            onClick={() => void resolve("approve")}
          >
            {resolving ? (
              <Spinner className="size-4 shrink-0" />
            ) : (
              <IconCheck16 className="size-4 shrink-0" />
            )}
            {resolving
              ? t("web.settingsPopup.devices.pending.trusting")
              : t("web.settingsPopup.devices.pending.trust")}
          </Button>
          <ControlGroup
            className="w-auto max-sm:w-full"
            aria-label={t("web.settingsPopup.devices.pending.notNow")}
          >
            <Button
              type="button"
              className="min-w-0 flex-1 gap-2"
              disabled={resolving}
              onClick={() => void resolve("reject")}
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
                    disabled={resolving}
                    onSelect={() => void block(option.duration)}
                  >
                    {t(option.labelKey)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </ControlGroup>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-muted-foreground">{t("web.settingsPopup.devices.pending.body")}</p>
        <PendingDeviceInfoCard
          form={resolveDeviceFormIcon(current)}
          brand={resolveDeviceBrandIcon(current)}
          title={formatDeviceTitle(current)}
          clientOs={formatDeviceClientOs(current)}
          timestamp={formatAbsoluteDate(current.created_at, locale)}
          ipLabel={t("web.settingsPopup.devices.pending.ip", {
            ip: current.ip_address || "unknown",
          })}
          countryLabel={t("web.settingsPopup.devices.pending.country", {
            country: current.country || t("web.settingsPopup.devices.pending.unknownLocation"),
          })}
          cityLabel={t("web.settingsPopup.devices.pending.city", {
            city: current.city || t("web.settingsPopup.devices.pending.unknownLocation"),
          })}
        />
      </div>
    </Popup>
  );
}
