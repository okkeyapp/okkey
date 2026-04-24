import * as React from "react";

import { cn } from "../../lib/utils.js";
import { PersonalWorkspaceMark } from "./workspace-tile.js";

const YANDEX_INTERNAL_SIZE = 120;

/** Tailwind-style 500 palette for deterministic fallbacks when `color` is omitted. */
const SHADCN_500_HEX = [
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

function stableIndexFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h % SHADCN_500_HEX.length;
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
  /** Page or item URLs; hosts are derived and passed to Yandex favicon (composite strip, first non-empty tile). */
  urls?: readonly string[];
  /** Edge length in CSS pixels (e.g. 32 in item lists). */
  size?: number;
  /** Fallback background when no favicon is shown; if omitted, a stable shadcn-500 hue is picked from `urls`. */
  color?: string;
  /**
   * When no remote favicon: show first character (uppercase, bold, white) on the fallback background.
   * (Named `monogram` to avoid clashing with the native HTML `title` tooltip attribute.)
   */
  monogram?: string;
  /** When no remote favicon: white icon centered on the fallback background. */
  icon?: React.ReactNode;
  /** `img` alt when a remote favicon is shown. */
  alt?: string;
};

/**
 * Favicon from Yandex composite strip (first non-empty tile), with monogram / icon / Okkey mark fallbacks.
 */
export function Favicon({
  urls,
  size = 32,
  color,
  monogram,
  icon,
  className,
  alt = "",
  ...rest
}: FaviconProps) {
  const urlsKey = (urls ?? []).join("\u0001");
  const hosts = React.useMemo(() => hostsFromUrls(urls ?? []), [urlsKey]);
  const compositeSrc = React.useMemo(() => (hosts.length ? buildYandexCompositeFaviconUrl(hosts) : ""), [hosts]);

  const defaultBg = React.useMemo(() => {
    const key = hosts.length ? hosts.join("|") : "okkey-favicon";
    return SHADCN_500_HEX[stableIndexFromString(key)] ?? SHADCN_500_HEX[0];
  }, [hosts]);

  const bg = color ?? defaultBg;

  const [remoteMode, setRemoteMode] = React.useState<"none" | "composite" | "single">("none");
  const [tileIndex, setTileIndex] = React.useState(0);
  const [singleSrc, setSingleSrc] = React.useState<string | null>(null);
  const [natural, setNatural] = React.useState<{ cw: number; ch: number } | null>(null);
  const [scanDone, setScanDone] = React.useState(!urls?.length);

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
            await loadImage(src, "");
            if (!cancelled) {
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
  }, [compositeSrc, urlsKey]);

  const px = `${size}px`;
  const letter = monogram?.trim().charAt(0).toLocaleUpperCase() ?? "";

  const compositeDisplayHeight =
    natural && natural.cw > 0 ? `${(natural.ch / natural.cw) * size}px` : undefined;

  return (
    <div
      className={cn("relative isolate min-h-0 min-w-0 shrink-0 overflow-hidden rounded-lg", className)}
      style={{ width: px, height: px }}
      {...rest}
    >
      {remoteMode === "composite" && compositeSrc && compositeDisplayHeight ? (
        <img
          src={compositeSrc}
          alt={alt}
          className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
          draggable={false}
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
          className="pointer-events-none absolute inset-0 size-full object-cover"
          draggable={false}
        />
      ) : null}

      {!scanDone && hosts.length ? (
        <div className="absolute inset-0 animate-pulse rounded-lg bg-muted" aria-hidden />
      ) : null}

      {scanDone && remoteMode === "none" ? (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: bg }}
        >
          {icon ? (
            <span className="flex size-[55%] items-center justify-center text-white [&_svg]:size-full">{icon}</span>
          ) : letter ? (
            <span className="font-bold text-white" style={{ fontSize: Math.max(10, Math.round(size * 0.42)) }}>
              {letter}
            </span>
          ) : (
            <PersonalWorkspaceMark fillColor={bg} className="size-[62%]" />
          )}
        </div>
      ) : null}
    </div>
  );
}
