import type { ReactNode } from "react";

import { Spinner } from "../ui/spinner.js";
import {
  DeviceTypeIcon,
  resolveDeviceBrandIcon,
  resolveDeviceFormIcon,
  type DeviceIconHints,
} from "./device-type-icon.js";

export type DevicePendingApprover = DeviceIconHints & {
  device_id: string;
  title: string;
  subtitle: string;
};

export type DevicePendingViewProps = {
  mode: "checking" | "pending" | "blocked" | "rejected";
  approversHeading?: string;
  approversEmpty?: string;
  waitingLabel?: string;
  blockedDetail?: string;
  approvers?: DevicePendingApprover[];
  footer?: ReactNode;
  actions?: ReactNode;
};

/**
 * Presentational pending/blocked/rejected device trust body (web DevicePendingPage + extension).
 */
export function DevicePendingView({
  mode,
  approversHeading,
  approversEmpty,
  waitingLabel,
  blockedDetail,
  approvers = [],
  footer,
  actions,
}: DevicePendingViewProps) {
  if (mode === "checking") {
    return (
      <div className="flex flex-col items-center gap-3 py-4" role="status" aria-busy="true">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {mode === "blocked" && blockedDetail ? (
        <p className="text-sm text-muted-foreground">{blockedDetail}</p>
      ) : null}

      {mode === "pending" ? (
        <div className="flex flex-col gap-3">
          {approversHeading ? (
            <p className="text-sm font-medium text-foreground">{approversHeading}</p>
          ) : null}
          {approvers.length === 0 ? (
            approversEmpty ? (
              <p className="text-sm text-muted-foreground">{approversEmpty}</p>
            ) : null
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-background">
              {approvers.map((device) => (
                <li key={device.device_id} className="flex items-center gap-4 px-4 py-3">
                  <DeviceTypeIcon
                    form={resolveDeviceFormIcon(device)}
                    brand={resolveDeviceBrandIcon(device)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{device.title}</p>
                    <p className="text-sm text-muted-foreground">{device.subtitle}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {waitingLabel ? (
            <div className="flex items-center gap-2 pt-1 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              <span>{waitingLabel}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "rejected" && actions ? <div className="flex flex-col gap-3">{actions}</div> : null}

      {footer}
    </div>
  );
}
