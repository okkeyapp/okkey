import * as React from "react";
import { createPortal } from "react-dom";

import {
  computeKeyFieldPortaledOverlayPosition,
  getScrollableAncestors,
  type KeyFieldOverlayPlacement,
} from "../../lib/key-field-portaled-overlay-position.js";

export type KeyFieldPortaledOverlayProps = {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
};

type KeyFieldPortaledOverlayContextValue = {
  placement: KeyFieldOverlayPlacement;
  portaled: boolean;
};

export const KeyFieldPortaledOverlayContext = React.createContext<KeyFieldPortaledOverlayContextValue>({
  placement: "bottom",
  portaled: false,
});

export function KeyFieldPortaledOverlay({ open, anchorRef, children }: KeyFieldPortaledOverlayProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [coords, setCoords] = React.useState<{ top: number; left: number; placement: KeyFieldOverlayPlacement } | null>(
    null,
  );

  const updatePosition = React.useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) {
      return;
    }

    // Repositioning while a Radix Select (month/year caption) is open remounts /
    // dismisses the listbox via focus + DismissableLayer. Skip until it closes.
    try {
      if (
        typeof document !== "undefined" &&
        document.querySelector(
          [
            "[data-radix-select-viewport]",
            '[role="listbox"][data-state="open"]',
            '[role="combobox"][data-state="open"]',
            '[aria-expanded="true"][aria-haspopup="listbox"]',
          ].join(","),
        )
      ) {
        return;
      }
    } catch {
      /* ignore */
    }

    const next = computeKeyFieldPortaledOverlayPosition({
      anchorRect: anchor.getBoundingClientRect(),
      panelRect: panel.getBoundingClientRect(),
    });
    setCoords(next);
  }, [anchorRef]);

  React.useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return undefined;
    }

    const anchor = anchorRef.current;
    if (!anchor) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      updatePosition();
    });

    const scrollParents = getScrollableAncestors(anchor);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    for (const parent of scrollParents) {
      parent.addEventListener("scroll", updatePosition, { passive: true });
    }

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      for (const parent of scrollParents) {
        parent.removeEventListener("scroll", updatePosition);
      }
    };
  }, [anchorRef, open, updatePosition]);

  React.useLayoutEffect(() => {
    if (!open || !coords) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      updatePosition();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [children, coords, open, updatePosition]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const contextValue: KeyFieldPortaledOverlayContextValue = {
    placement: coords?.placement ?? "bottom",
    portaled: true,
  };

  return createPortal(
    <KeyFieldPortaledOverlayContext.Provider value={contextValue}>
      <div
        ref={panelRef}
        className="fixed z-floating"
        style={{
          top: coords?.top ?? -9999,
          left: coords?.left ?? -9999,
          visibility: coords ? "visible" : "hidden",
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </KeyFieldPortaledOverlayContext.Provider>,
    document.body,
  );
}
