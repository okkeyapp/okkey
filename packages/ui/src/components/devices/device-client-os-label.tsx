import * as React from "react";

import { cn } from "../../lib/utils.js";

const DEVICE_CLIENT_OS_SEPARATOR = " · ";

export type DeviceClientOsLabelProps = {
  /** Output of `formatDeviceClientOs` (`Web · Chrome · macOS`). */
  value: string;
  className?: string;
};

/**
 * Renders device channel / client / OS so narrow screens wrap between segments
 * without orphaning the middle-dot separators onto their own lines.
 */
export function DeviceClientOsLabel({ value, className }: DeviceClientOsLabelProps) {
  const parts = value.split(DEVICE_CLIENT_OS_SEPARATOR).filter((part) => part.length > 0);

  if (parts.length <= 1) {
    return <p className={cn("text-sm text-muted-foreground", className)}>{value}</p>;
  }

  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`} className="whitespace-nowrap">
          {index > 0 ? DEVICE_CLIENT_OS_SEPARATOR : null}
          {part}
        </span>
      ))}
    </p>
  );
}
