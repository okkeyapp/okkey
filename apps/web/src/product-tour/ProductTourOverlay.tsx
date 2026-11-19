import { Button, cn, OKKEY_Z_INDEX } from "@okkey/ui";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type ProductTourOverlayProps = {
  title: string;
  body: string;
  nextLabel: string;
  skipLabel: string;
  /** CSS selectors for elements to spotlight (union bounding box). */
  anchorSelectors: readonly string[];
  /** When true, dim the whole viewport without a cutout (step 4). */
  fullDim?: boolean;
  onNext: () => void;
  onSkip: () => void;
  /** Keep the account menu (or other host UI) mounted while the tip is shown. */
  children?: ReactNode;
};

function readUnionRect(selectors: readonly string[]): SpotlightRect | null {
  const rects: DOMRect[] = [];
  for (const selector of selectors) {
    const nodes = document.querySelectorAll(selector);
    nodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        rects.push(rect);
      }
    });
  }
  if (rects.length === 0) {
    return null;
  }
  let top = Number.POSITIVE_INFINITY;
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const rect of rects) {
    top = Math.min(top, rect.top);
    left = Math.min(left, rect.left);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }
  const pad = 6;
  return {
    top: Math.max(0, top - pad),
    left: Math.max(0, left - pad),
    width: Math.max(0, right - left + pad * 2),
    height: Math.max(0, bottom - top + pad * 2),
  };
}

function tipPlacement(spotlight: SpotlightRect | null): {
  top: number;
  left: number;
} {
  const tipWidth = 320;
  const margin = 16;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  if (!spotlight) {
    return {
      top: Math.max(margin, viewportH / 2 - 80),
      left: Math.max(margin, (viewportW - tipWidth) / 2),
    };
  }

  const belowTop = spotlight.top + spotlight.height + 12;
  const aboveTop = spotlight.top - 12 - 160;
  const preferBelow = belowTop + 180 < viewportH;
  const top = preferBelow ? belowTop : Math.max(margin, aboveTop);
  let left = spotlight.left + spotlight.width / 2 - tipWidth / 2;
  left = Math.min(Math.max(margin, left), viewportW - tipWidth - margin);
  return { top, left };
}

/**
 * Lightweight spotlight tour chrome using existing Button styles.
 * Visuals are intentionally provisional until design lands.
 */
export function ProductTourOverlay({
  title,
  body,
  nextLabel,
  skipLabel,
  anchorSelectors,
  fullDim = false,
  onNext,
  onSkip,
  children,
}: ProductTourOverlayProps) {
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [tipPos, setTipPos] = useState({ top: 24, left: 24 });

  useLayoutEffect(() => {
    if (fullDim) {
      setSpotlight(null);
      setTipPos(tipPlacement(null));
      return;
    }
    const update = () => {
      const next = readUnionRect(anchorSelectors);
      setSpotlight(next);
      setTipPos(tipPlacement(next));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const interval = window.setInterval(update, 250);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.clearInterval(interval);
    };
  }, [anchorSelectors, fullDim]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const z = OKKEY_Z_INDEX.floating;

  return (
    <div className="fixed inset-0" style={{ zIndex: z }} data-testid="product-tour-overlay" role="dialog" aria-modal="true" aria-labelledby="product-tour-title">
      {children}
      {/* Dim layers with optional spotlight hole */}
      {fullDim || !spotlight ? (
        <div className="absolute inset-0 bg-black/50" aria-hidden />
      ) : (
        <>
          <div className="absolute inset-x-0 top-0 bg-black/50" style={{ height: Math.max(0, spotlight.top) }} aria-hidden />
          <div
            className="absolute inset-x-0 bg-black/50"
            style={{ top: spotlight.top + spotlight.height, bottom: 0 }}
            aria-hidden
          />
          <div
            className="absolute bg-black/50"
            style={{ top: spotlight.top, left: 0, width: Math.max(0, spotlight.left), height: spotlight.height }}
            aria-hidden
          />
          <div
            className="absolute bg-black/50"
            style={{
              top: spotlight.top,
              left: spotlight.left + spotlight.width,
              right: 0,
              height: spotlight.height,
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-transparent"
            style={{
              top: spotlight.top,
              left: spotlight.left,
              width: spotlight.width,
              height: spotlight.height,
            }}
            aria-hidden
          />
        </>
      )}

      <div
        className={cn(
          "absolute w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-border bg-background p-4 shadow-lg",
        )}
        style={{ top: tipPos.top, left: tipPos.left, zIndex: z + 1 }}
        data-testid="product-tour-tip"
      >
        <h2 id="product-tour-title" className="text-sm font-semibold text-foreground">
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onSkip} data-testid="product-tour-skip">
            {skipLabel}
          </Button>
          <Button type="button" variant="default" size="sm" onClick={onNext} data-testid="product-tour-next">
            {nextLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
