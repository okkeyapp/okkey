import * as React from "react";

import { cn } from "../../lib/utils.js";
import { PersonalWorkspaceMark } from "./workspace-tile.js";

const YANDEX_INTERNAL_SIZE = 120;

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

/** URLs suitable for Yandex favicon lookup (skip localhost, IPs, single-label hosts). */
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

/** First URL in `urls` that can be resolved via Yandex favicon API. */
export function primaryFaviconUrl(urls: readonly string[] | undefined): string | undefined {
  if (!urls?.length) {
    return undefined;
  }
  return urlsForRemoteFavicon(urls)[0];
}

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

function singleHostFaviconUrl(host: string, size = YANDEX_INTERNAL_SIZE): string {
  return `https://favicon.yandex.net/favicon/${encodeURIComponent(host)}?size=${size}`;
}

function isTileLikelyEmpty(imageData: ImageData, tileW: number, tileH: number): boolean {
  const { data } = imageData;
  let minL = 255;
  let maxL = 0;
  let sumA = 0;
  const step = 6;
  let samples = 0;
  for (let y = 0; y < tileH; y += step) {
    for (let x = 0; x < tileW; x += step) {
      const i = (y * tileW + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const a = data[i + 3] ?? 0;
      sumA += a;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      minL = Math.min(minL, l);
      maxL = Math.max(maxL, l);
      samples += 1;
    }
  }
  const range = maxL - minL;
  const avgA = sumA / Math.max(1, samples);
  if (avgA < 28) {
    return true;
  }
  return range < 18;
}

function analyzeTiles(img: HTMLImageElement): { nTiles: number; firstNonEmpty: number | null } {
  const cw = img.naturalWidth;
  const ch = img.naturalHeight;
  if (cw <= 0 || ch <= 0) {
    return { nTiles: 0, firstNonEmpty: null };
  }
  const tileW = cw;
  const nTiles = Math.max(1, Math.round(ch / cw));

  const canvas = document.createElement("canvas");
  canvas.width = tileW;
  canvas.height = tileW;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return { nTiles, firstNonEmpty: null };
  }

  if (nTiles === 1) {
    ctx.drawImage(img, 0, 0, cw, ch, 0, 0, tileW, tileW);
    try {
      const data = ctx.getImageData(0, 0, tileW, tileW);
      return { nTiles: 1, firstNonEmpty: isTileLikelyEmpty(data, tileW, tileW) ? null : 0 };
    } catch {
      return { nTiles: 1, firstNonEmpty: null };
    }
  }

  for (let i = 0; i < nTiles; i += 1) {
    ctx.clearRect(0, 0, tileW, tileW);
    ctx.drawImage(img, 0, i * tileW, tileW, tileW, 0, 0, tileW, tileW);
    try {
      const data = ctx.getImageData(0, 0, tileW, tileW);
      if (!isTileLikelyEmpty(data, tileW, tileW)) {
        return { nTiles, firstNonEmpty: i };
      }
    } catch {
      return { nTiles, firstNonEmpty: null };
    }
  }
  return { nTiles, firstNonEmpty: null };
}

function loadImage(src: string, crossOrigin: "" | "anonymous"): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) {
      img.crossOrigin = crossOrigin;
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load error"));
    img.src = src;
  });
}

export type FaviconProps = Omit<React.HTMLAttributes<HTMLDivElement>, "title"> & {
  /** Record display name; first letter is used as monogram when remote favicon is unavailable. */
  name?: string;
  /** Website URLs in priority order; the first URL suitable for lookup drives the remote favicon. */
  urls?: readonly string[];
  /**
   * When true, pass all suitable `urls` to the Yandex composite strip and show the first non-empty tile.
   * Default (`false`): only the first suitable URL is requested (record list / form behaviour).
   */
  compositeStrip?: boolean;
  /** Edge length in CSS pixels (e.g. 32 in item lists). */
  size?: number;
  /** Fallback background when no favicon is shown; if omitted, a stable shadcn-500 hue is picked from `urls`. */
  color?: string;
  /**
   * Override monogram text (max 2 chars); defaults to initials derived from `name`.
   * (Named `monogram` to avoid clashing with the native HTML `title` tooltip attribute.)
   */
  monogram?: string;
  /** When no remote favicon and no monogram from `name`: category/type icon on the fallback background. */
  icon?: React.ReactNode;
  /** `img` alt when a remote favicon is shown. */
  alt?: string;
};

/**
 * Favicon for records: remote tile from the primary URL, then monogram from `name`, then `icon`, then Okkey mark.
 */
export function Favicon({
  name,
  urls,
  compositeStrip = false,
  size = 32,
  color,
  monogram,
  icon,
  className,
  alt = "",
  ...rest
}: FaviconProps) {
  const urlsKey = (urls ?? []).join("\u0001");
  const remoteUrls = React.useMemo(() => {
    const suitable = urlsForRemoteFavicon(urls ?? []);
    if (compositeStrip) {
      return suitable;
    }
    const primary = suitable[0];
    return primary ? [primary] : [];
  }, [compositeStrip, urlsKey]);
  const hosts = React.useMemo(() => hostsFromUrls(remoteUrls), [remoteUrls]);
  const compositeSrc = React.useMemo(() => (hosts.length ? buildYandexCompositeFaviconUrl(hosts) : ""), [hosts]);

  const defaultBg = React.useMemo(() => {
    const key = hosts.length ? hosts.join("|") : name?.trim() || "okkey-favicon";
    return SHADCN_500_HEX[stableIndexFromString(key)] ?? SHADCN_500_HEX[0];
  }, [hosts, name]);

  const iconFallbackBg = color ?? defaultBg;

  const [remoteMode, setRemoteMode] = React.useState<"none" | "composite" | "single">("none");
  const [tileIndex, setTileIndex] = React.useState(0);
  const [singleSrc, setSingleSrc] = React.useState<string | null>(null);
  const [natural, setNatural] = React.useState<{ cw: number; ch: number } | null>(null);
  const [scanDone, setScanDone] = React.useState(!remoteUrls.length);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      setRemoteMode("none");
      setSingleSrc(null);
      setNatural(null);
      setTileIndex(0);

      if (!hosts.length || !compositeSrc) {
        setScanDone(true);
        return;
      }

      setScanDone(false);

      try {
        try {
          const img = await loadImage(compositeSrc, "anonymous");
          if (cancelled) {
            return;
          }
          const { firstNonEmpty } = analyzeTiles(img);
          if (firstNonEmpty != null) {
            setTileIndex(firstNonEmpty);
            setNatural({ cw: img.naturalWidth, ch: img.naturalHeight });
            setRemoteMode("composite");
            return;
          }
        } catch {
          /* try uncredentialed fetch for canvas */
        }

        try {
          const img = await loadImage(compositeSrc, "");
          if (cancelled) {
            return;
          }
          const { firstNonEmpty } = analyzeTiles(img);
          if (firstNonEmpty != null) {
            setTileIndex(firstNonEmpty);
            setNatural({ cw: img.naturalWidth, ch: img.naturalHeight });
            setRemoteMode("composite");
            return;
          }
        } catch {
          /* ignore */
        }

        for (const host of hosts) {
          if (cancelled) {
            return;
          }
          const src = singleHostFaviconUrl(host);
          try {
            const im = await loadImage(src, "anonymous");
            if (cancelled) {
              return;
            }
            const { firstNonEmpty } = analyzeTiles(im);
            if (firstNonEmpty != null) {
              setSingleSrc(src);
              setRemoteMode("single");
              return;
            }
          } catch {
            /* next */
          }
        }

        for (const host of hosts) {
          if (cancelled) {
            return;
          }
          const src = singleHostFaviconUrl(host);
          try {
            const im = await loadImage(src, "");
            if (cancelled) {
              return;
            }
            const { firstNonEmpty } = analyzeTiles(im);
            if (firstNonEmpty != null) {
              setSingleSrc(src);
              setRemoteMode("single");
              return;
            }
          } catch {
            /* next */
          }
        }
      } finally {
        if (!cancelled) {
          setScanDone(true);
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [compositeSrc, hosts, urlsKey]);

  const px = `${size}px`;
  const monogramText = deriveFaviconMonogram(name, monogram);
  const monogramBg = monogramText ? faviconMonogramBackgroundColor(monogramText) : undefined;
  const showCustomFallback = (Boolean(monogramText) || Boolean(icon)) && scanDone && remoteMode === "none";

  const compositeDisplayHeight =
    natural && natural.cw > 0 ? `${(natural.ch / natural.cw) * size}px` : undefined;

  const showRemoteFallback = () => {
    setRemoteMode("none");
    setSingleSrc(null);
    setNatural(null);
  };

  return (
    <div
      className={cn("relative isolate min-h-0 min-w-0 shrink-0 overflow-hidden rounded-lg", className)}
      style={{ width: px, height: px }}
      {...rest}
    >
      {showCustomFallback ? (
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

      {remoteMode === "composite" && compositeSrc && compositeDisplayHeight ? (
        <img
          src={compositeSrc}
          alt={alt}
          className="pointer-events-none absolute left-0 top-0 z-[1] max-w-none select-none"
          draggable={false}
          onError={showRemoteFallback}
          style={{
            width: px,
            height: compositeDisplayHeight,
            top: `calc(-1 * ${tileIndex} * ${px})`,
          }}
        />
      ) : null}

      {remoteMode === "single" && singleSrc ? (
        <img
          src={singleSrc}
          alt={alt}
          width={size}
          height={size}
          className="pointer-events-none absolute inset-0 z-[1] size-full object-cover"
          draggable={false}
          onError={showRemoteFallback}
        />
      ) : null}

      {!scanDone && remoteUrls.length ? (
        <div className="absolute inset-0 animate-pulse rounded-lg bg-muted" aria-hidden />
      ) : null}

      {!monogramText && !icon && scanDone && remoteMode === "none" ? (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: iconFallbackBg }}
        >
          <PersonalWorkspaceMark fillColor={iconFallbackBg} className="size-[62%]" />
        </div>
      ) : null}
    </div>
  );
}
