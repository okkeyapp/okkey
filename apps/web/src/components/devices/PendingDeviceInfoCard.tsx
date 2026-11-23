import {
  DeviceClientOsLabel,
  DeviceTypeIcon,
  cn,
  type DeviceBrandIcon,
  type DeviceFormIcon,
} from "@okkey/ui";
import type { ReactNode } from "react";

export type PendingDeviceInfoCardProps = {
  form: DeviceFormIcon;
  brand: DeviceBrandIcon;
  title: string;
  clientOs: string;
  timestamp: string;
  ipLabel: ReactNode;
  countryLabel: ReactNode;
  cityLabel: ReactNode;
  /** Override default secondary card chrome (e.g. when embedded in another card). */
  className?: string;
};

/**
 * Shared device + geo meta card for device/recovery approval popups.
 * Grid + minmax(0,1fr) keeps identity and geo columns from overlapping on
 * desktop; long titles/OS labels truncate with a native title tooltip.
 */
export default function PendingDeviceInfoCard({
  form,
  brand,
  title,
  clientOs,
  timestamp,
  ipLabel,
  countryLabel,
  cityLabel,
  className,
}: PendingDeviceInfoCardProps) {
  return (
    <div
      className={cn(
        // Mobile: explicit column flex (avoids sub-pixel grid row collisions at ~320px).
        // Desktop: two-column grid with minmax(0,1fr) so long titles cannot overlap geo.
        "flex flex-col gap-3 rounded-xl bg-secondary p-4 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,max-content)] sm:items-start sm:gap-4",
        className,
      )}
      data-testid="pending-device-info-card"
    >
      <div className="flex min-w-0 items-center gap-4" data-testid="pending-device-identity">
        <DeviceTypeIcon form={form} brand={brand} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <p
            className="truncate text-sm font-medium text-foreground"
            title={title}
            data-testid="pending-device-title"
          >
            {title}
          </p>
          <DeviceClientOsLabel value={clientOs} />
          <p className="truncate text-sm text-muted-foreground" title={timestamp}>
            {timestamp}
          </p>
        </div>
      </div>
      <div
        className="min-w-0 break-words text-[13px] leading-5 text-muted-foreground sm:max-w-[14rem] sm:justify-self-end sm:text-right"
        data-testid="pending-device-geo"
      >
        <p data-testid="pending-device-ip">{ipLabel}</p>
        <p data-testid="pending-device-country">{countryLabel}</p>
        <p data-testid="pending-device-city">{cityLabel}</p>
      </div>
    </div>
  );
}
