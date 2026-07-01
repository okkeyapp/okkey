import * as React from "react";

import { cn } from "../../lib/utils.js";
import { PersonalWorkspaceMark } from "./workspace-tile.js";
import { Skeleton } from "./skeleton.js";

/** Tailwind/shadcn 500 palette — monogram backgrounds and generic fallbacks. */
export const FAVICON_MONOGRAM_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#64748b",
] as const;

const SHADCN_500_HEX = FAVICON_MONOGRAM_COLORS;

function stableIndexFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h % SHADCN_500_HEX.length;
}

/** Up to two initials: first letters of the first two words, or the first two characters. */
export function deriveFaviconMonogram(name?: string, monogram?: string): string {
  const override = monogram?.trim();
  if (override) {
    return takeMonogramLetters(override);
  }
  return takeMonogramLetters(name ?? "");
}

function isAlphanumericChar(ch: string): boolean {
  return /[\p{L}\p{N}]/u.test(ch);
}

function firstAlphanumericChar(token: string): string {
  for (const ch of token) {
    if (isAlphanumericChar(ch)) {
      return ch;
    }
  }
  return "";
}

function firstAlphanumericChars(input: string, count: number): string {
  const out: string[] = [];
  for (const ch of input) {
    if (isAlphanumericChar(ch)) {
      out.push(ch);
      if (out.length >= count) {
        break;
      }
    }
  }
  return out.join("").toLocaleUpperCase();
}

function takeMonogramLetters(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  const words = trimmed.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length >= 2) {
    const first = firstAlphanumericChar(words[0] ?? "");
    const second = firstAlphanumericChar(words[1] ?? "");
    if (first && second) {
      return (first + second).toLocaleUpperCase();
    }
  }
  return firstAlphanumericChars(trimmed, 2);
}

/** Background for monogram tiles — hue bucket from the first letter (1Password-style). */
export function faviconMonogramBackgroundColor(monogram: string): string {
  const first = firstAlphanumericChar(monogram).toUpperCase();
  if (!first) {
    return SHADCN_500_HEX[0];
  }
  const code = first.charCodeAt(0);
  if (code >= 65 && code <= 90) {
    return SHADCN_500_HEX[(code - 65) % SHADCN_500_HEX.length] ?? SHADCN_500_HEX[0];
  }
  return SHADCN_500_HEX[stableIndexFromString(monogram)] ?? SHADCN_500_HEX[0];
}

/** Extract hostname from a full URL or bare host string. */
export function parseHostFromUrl(input: string): string | null {
  const t = input.trim();
  if (!t) {
    return null;
  }
  try {
    const u = new URL(t.includes("://") ? t : `https://${t}`);
    const host = u.hostname.replace(/^www\./i, "");
    return host || null;
  } catch {
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(t)) {
      return t.replace(/^www\./i, "").toLowerCase();
    }
    return null;
  }
}

export function hostsFromUrls(urls: readonly string[] | undefined): string[] {
  if (!urls?.length) {
    return [];
  }
  const out: string[] = [];
  for (const u of urls) {
    const h = parseHostFromUrl(u);
    if (h) {
      out.push(h);
    }
  }
  return out;
}

const IPV4_HOST_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function isIpv4Host(host: string): boolean {
  return IPV4_HOST_RE.test(host);
}

/** URLs suitable for remote favicon lookup (skip localhost, IPs, single-label hosts). */
export function urlsForRemoteFavicon(urls: readonly string[]): string[] {
  return urls.filter((url) => {
    const host = parseHostFromUrl(url);
    if (!host) {
      return false;
    }
    const normalized = host.toLowerCase();
    if (normalized === "localhost" || normalized.endsWith(".local") || isIpv4Host(normalized)) {
      return false;
    }
    return normalized.includes(".");
  });
}

/** First URL in `urls` that can be resolved via remote favicon API. */
export function primaryFaviconUrl(urls: readonly string[] | undefined): string | undefined {
  if (!urls?.length) {
    return undefined;
  }
  return urlsForRemoteFavicon(urls)[0];
}

const YANDEX_INTERNAL_SIZE = 120;

/**
 * Yandex favicon API: multiple hosts in the path return a vertical strip of squares
 * (`size`×`size` each), in the same order — some slots may be empty.
 *
 * @see https://favicon.yandex.net/favicon/badexample.com/gog.com/yandex.ru?size=120
 */
export function buildYandexCompositeFaviconUrl(hosts: readonly string[], size = YANDEX_INTERNAL_SIZE): string {
  const parts = hosts.map((h) => h.trim().toLowerCase().replace(/^www\./i, "")).filter(Boolean);
  if (parts.length === 0) {
    return "";
  }
  return `https://favicon.yandex.net/favicon/${parts.map((p) => encodeURIComponent(p)).join("/")}?size=${size}`;
}

export type FaviconProps = Omit<React.HTMLAttributes<HTMLDivElement>, "title"> & {
  /** Stored favicon image URL (MinIO/API). When set, renders a single `<img>` without remote lookups. */
  imageSrc?: string;
  /** Pass `loading="lazy"` to the image (list rows). */
  lazy?: boolean;
  /** Record display name; first letter is used as monogram when no image is shown. */
  name?: string;
  /** @deprecated Dev gallery only — production uses `imageSrc` from stored favicons. */
  urls?: readonly string[];
  /** @deprecated Dev gallery composite strip demo. */
  compositeStrip?: boolean;
  /** Edge length in CSS pixels (e.g. 32 in item lists). */
  size?: number;
  /** Fallback background when no favicon is shown. */
  color?: string;
  monogram?: string;
  /** When no image and no monogram from `name`: category/type icon on the fallback background. */
  icon?: React.ReactNode;
  /** Shows a pulse skeleton instead of monogram/icon while a remote preview is loading. */
  loading?: boolean;
  alt?: string;
};

/**
 * Record favicon tile: stored image, then monogram from `name`, then `icon`, then Okkey mark.
 */
export function Favicon({
  imageSrc,
  lazy = false,
  name,
  urls,
  compositeStrip = false,
  size = 32,
  color,
  monogram,
  icon,
  loading = false,
  className,
  alt = "",
  ...rest
}: FaviconProps) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const [imageLoaded, setImageLoaded] = React.useState(false);
  React.useEffect(() => {
    setImageFailed(false);
    setImageLoaded(false);
  }, [imageSrc]);

  const hosts = React.useMemo(() => hostsFromUrls(urls ?? []), [urls]);
  const defaultBg = React.useMemo(() => {
    const key = hosts.length ? hosts.join("|") : name?.trim() || "okkey-favicon";
    return SHADCN_500_HEX[stableIndexFromString(key)] ?? SHADCN_500_HEX[0];
  }, [hosts, name]);
  const iconFallbackBg = color ?? defaultBg;

  const px = `${size}px`;
  const monogramText = deriveFaviconMonogram(name, monogram);
  const monogramBg = monogramText ? faviconMonogramBackgroundColor(monogramText) : undefined;
  const hasImageSrc = Boolean(imageSrc) && !imageFailed;
  const imagePending = hasImageSrc && !imageLoaded;
  const showSkeleton = loading || imagePending;
  const showImage = hasImageSrc && imageLoaded;

  const devCompositeSrc =
    !imageSrc && compositeStrip && hosts.length ? buildYandexCompositeFaviconUrl(hosts) : "";

  return (
    <div
      className={cn("relative isolate min-h-0 min-w-0 shrink-0 overflow-hidden rounded-lg", className)}
      style={{ width: px, height: px }}
      {...rest}
    >
      {showSkeleton ? <Skeleton className="absolute inset-0 z-[1] rounded-lg" /> : null}

      {hasImageSrc ? (
        <img
          src={imageSrc}
          alt={alt}
          width={size}
          height={size}
          loading={lazy ? "lazy" : undefined}
          decoding="async"
          className={cn(
            "pointer-events-none size-full object-cover",
            imagePending && "opacity-0",
          )}
          draggable={false}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageFailed(true)}
        />
      ) : null}

      {!showSkeleton && !hasImageSrc && (monogramText || icon) ? (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: monogramText ? monogramBg : iconFallbackBg }}
          aria-hidden
        >
          {monogramText ? (
            <span
              className="font-semibold uppercase tracking-tight text-white"
              style={{ fontSize: Math.max(9, Math.round(size * (monogramText.length > 1 ? 0.34 : 0.4))) }}
            >
              {monogramText}
            </span>
          ) : icon ? (
            <span className="flex size-[55%] items-center justify-center text-white [&_svg]:size-full">{icon}</span>
          ) : null}
        </div>
      ) : null}

      {!showSkeleton && !hasImageSrc && !monogramText && !icon && devCompositeSrc ? (
        <img
          src={devCompositeSrc}
          alt={alt}
          width={size}
          height={size}
          className="pointer-events-none size-full object-cover"
          draggable={false}
        />
      ) : null}

      {!showSkeleton && !hasImageSrc && !monogramText && !icon && !devCompositeSrc ? (
        <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: iconFallbackBg }}>
          <PersonalWorkspaceMark fillColor={iconFallbackBg} className="size-[62%]" />
        </div>
      ) : null}
    </div>
  );
}
