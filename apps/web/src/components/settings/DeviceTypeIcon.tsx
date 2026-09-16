import { cn } from "@okkey/ui";
import type { CSSProperties } from "react";

import devicesSprite from "../../assets/device-icons/devices-x2.png";
import iconsSprite from "../../assets/device-icons/icons-x2.png";

/** @2x sprite: 3×80px cells, 4px gap → phone | laptop | browser-app */
export type DeviceFormIcon = "phone" | "laptop" | "browserApp";

/**
 * @2x sprite: 13×32px cells, 4px gap.
 * apple | windows | android | linux | chrome | firefox | opera | safari | edge | yandex | tor | vivaldi | generic
 */
export type DeviceBrandIcon =
  | "apple"
  | "windows"
  | "android"
  | "linux"
  | "chrome"
  | "firefox"
  | "opera"
  | "safari"
  | "edge"
  | "yandex"
  | "tor"
  | "vivaldi"
  | "generic";

const DEVICE_FORM_INDEX: Record<DeviceFormIcon, number> = {
  phone: 0,
  laptop: 1,
  browserApp: 2,
};

const BRAND_INDEX: Record<DeviceBrandIcon, number> = {
  apple: 0,
  windows: 1,
  android: 2,
  linux: 3,
  chrome: 4,
  firefox: 5,
  opera: 6,
  safari: 7,
  edge: 8,
  yandex: 9,
  tor: 10,
  vivaldi: 11,
  generic: 12,
};

const DEVICE_CELL_X2 = 80;
const DEVICE_GAP_X2 = 4;
const BRAND_CELL_X2 = 32;
const BRAND_GAP_X2 = 4;

/** Accepts both camelCase helpers and wire `DeviceListItemDto` snake_case fields. */
export type DeviceIconHints = {
  clientType?: string | null;
  client_type?: string | null;
  platform?: string | null;
  osName?: string | null;
  os_name?: string | null;
  userAgent?: string | null;
  user_agent?: string | null;
  deviceName?: string | null;
  device_name?: string | null;
};

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
}

function spriteStyle(
  imageUrl: string,
  cellX2: number,
  gapX2: number,
  index: number,
  displayPx: number,
): CSSProperties {
  const scale = displayPx / cellX2;
  return {
    width: cellX2,
    height: cellX2,
    backgroundImage: `url(${imageUrl})`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: `-${index * (cellX2 + gapX2)}px 0`,
    transform: `scale(${scale})`,
    transformOrigin: "top left",
  };
}

/**
 * Sprites already have transparent packing. Opaque pixels (light fills + dark
 * details) become `currentColor` via alpha mask — preserves laptop base / outlines.
 * No CSS `filter: invert`.
 */
function alphaMaskStyle(
  imageUrl: string,
  cellX2: number,
  gapX2: number,
  cellCount: number,
  index: number,
  displayPx: number,
): CSSProperties {
  const scale = displayPx / cellX2;
  const sheetWidthX2 = cellCount * cellX2 + (cellCount - 1) * gapX2;
  const offsetX = index * (cellX2 + gapX2) * scale;
  return {
    width: displayPx,
    height: displayPx,
    backgroundColor: "currentColor",
    WebkitMaskImage: `url(${imageUrl})`,
    maskImage: `url(${imageUrl})`,
    WebkitMaskSize: `${sheetWidthX2 * scale}px ${displayPx}px`,
    maskSize: `${sheetWidthX2 * scale}px ${displayPx}px`,
    WebkitMaskPosition: `-${offsetX}px 0`,
    maskPosition: `-${offsetX}px 0`,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskMode: "alpha",
    maskMode: "alpha",
  };
}

export function resolveDeviceFormIcon(input: DeviceIconHints): DeviceFormIcon {
  const client = firstNonEmpty(input.clientType, input.client_type).toLowerCase();
  const platform = (input.platform ?? "").toLowerCase();
  if (
    client.includes("extension") ||
    client.includes("browser_app") ||
    client.includes("browser-app")
  ) {
    return "browserApp";
  }
  if (
    client.includes("mobile") ||
    client.includes("ios") ||
    client.includes("android") ||
    platform.includes("ios") ||
    platform.includes("android") ||
    platform.includes("iphone") ||
    platform.includes("ipad")
  ) {
    return "phone";
  }
  return "laptop";
}

export function resolveDeviceBrandIcon(input: DeviceIconHints): DeviceBrandIcon {
  const clientType = firstNonEmpty(input.clientType, input.client_type);
  const haystack = [
    clientType,
    input.platform,
    firstNonEmpty(input.osName, input.os_name),
    firstNonEmpty(input.userAgent, input.user_agent),
    firstNonEmpty(input.deviceName, input.device_name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\bedge\b|edg\//.test(haystack)) return "edge";
  if (/\bopera\b|opr\//.test(haystack)) return "opera";
  if (/\bfirefox\b|fxios/.test(haystack)) return "firefox";
  if (/\bsafari\b/.test(haystack) && !/\bchrome\b|crios|chromium/.test(haystack)) return "safari";
  if (/\byandex\b/.test(haystack)) return "yandex";
  if (/\btor\b/.test(haystack)) return "tor";
  if (/\bvivaldi\b/.test(haystack)) return "vivaldi";
  if (/\bchrome\b|crios|chromium/.test(haystack)) return "chrome";
  // Prefer explicit browser brands from client_type / UA. Legacy "web" alone is ambiguous.
  if (/\bweb\b/.test(clientType.toLowerCase()) && !haystack.includes(" ")) return "generic";

  if (/\bandroid\b/.test(haystack)) return "android";
  if (/\blinux\b/.test(haystack) && !/\bandroid\b/.test(haystack)) return "linux";
  if (/\bwindows\b|win32|win64/.test(haystack)) return "windows";
  if (/\bmacos\b|\bmac os\b|\bios\b|\biphone\b|\bipad\b|\bapple\b|\bdarwin\b|\bmacintosh\b/.test(haystack)) {
    return "apple";
  }

  return "generic";
}

type DeviceTypeIconProps = {
  form: DeviceFormIcon;
  brand: DeviceBrandIcon;
  className?: string;
  label?: string;
};

/**
 * 40×40 container with form silhouette + brand overlay.
 * Brand inner is 16×16; browser-app brand overlay is 12×12 per sprite spec.
 * Form and color brands render as plain sprite images (no invert / colorize).
 * Monochrome brands (apple/generic) are black glyphs — alpha-mask to foreground.
 */
export function DeviceTypeIcon({ form, brand, className, label }: DeviceTypeIconProps) {
  const brandSize = form === "browserApp" ? 12 : 16;
  const monochromeBrand = brand === "apple" || brand === "generic";

  return (
    <div
      className={cn("relative size-10 shrink-0 overflow-hidden", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <div
        className="pointer-events-none absolute left-0 top-0"
        style={spriteStyle(
          devicesSprite,
          DEVICE_CELL_X2,
          DEVICE_GAP_X2,
          DEVICE_FORM_INDEX[form],
          40,
        )}
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2 overflow-hidden"
        style={{ width: brandSize, height: brandSize }}
      >
        {monochromeBrand ? (
          <div
            className="text-foreground"
            style={alphaMaskStyle(
              iconsSprite,
              BRAND_CELL_X2,
              BRAND_GAP_X2,
              13,
              BRAND_INDEX[brand],
              brandSize,
            )}
          />
        ) : (
          <div
            style={spriteStyle(
              iconsSprite,
              BRAND_CELL_X2,
              BRAND_GAP_X2,
              BRAND_INDEX[brand],
              brandSize,
            )}
          />
        )}
      </div>
    </div>
  );
}
