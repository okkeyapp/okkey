import { cn } from "../../lib/utils.js";

const DEVICE_CLIENT_OS_SEPARATOR = " · ";

export type DeviceClientOsLabelProps = {
  /** Output of `formatDeviceClientOs` (`Web · Chrome · macOS`). */
  value: string;
  className?: string;
};

/**
 * Renders device channel / client / OS.
 * Uses non-breaking spaces before middle dots so wraps never orphan separators,
 * truncates with ellipsis when the row is constrained, and exposes the full
 * value via `title` for hover/long-press.
 */
export function DeviceClientOsLabel({ value, className }: DeviceClientOsLabelProps) {
  const parts = value.split(DEVICE_CLIENT_OS_SEPARATOR).filter((part) => part.length > 0);
  const display =
    parts.length <= 1
      ? value
      : `${parts[0]}${parts
          .slice(1)
          .map((part) => `\u00A0· ${part}`)
          .join("")}`;

  return (
    <p
      className={cn("min-w-0 truncate text-sm text-muted-foreground", className)}
      title={value}
      data-testid="pending-device-client-os"
    >
      {display}
    </p>
  );
}
