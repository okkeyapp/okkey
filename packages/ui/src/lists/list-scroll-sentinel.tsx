import { useEffect, useRef, type RefObject } from "react";

import { getScrollAreaViewport } from "../lib/popup-scroll-shadow.js";
import { cn } from "../lib/utils.js";

export type ListScrollSentinelProps = {
  /** Called when the sentinel intersects the scroll root (or viewport). */
  onVisible: () => void;
  /** ScrollArea root element; observer root = its Radix viewport. */
  scrollAreaRef?: RefObject<HTMLElement | null>;
  /** Explicit IntersectionObserver root (e.g. horizontal overflow container). */
  rootRef?: RefObject<HTMLElement | null>;
  /** When true, observer is not attached. */
  disabled?: boolean;
  className?: string;
};

function resolveObserverRoot(
  sentinel: HTMLElement,
  scrollAreaRef?: RefObject<HTMLElement | null>,
  rootRef?: RefObject<HTMLElement | null>,
): Element | null {
  if (rootRef?.current) {
    return rootRef.current;
  }
  if (scrollAreaRef?.current) {
    const viewport = getScrollAreaViewport(scrollAreaRef.current);
    if (viewport) {
      return viewport;
    }
  }
  let el: HTMLElement | null = sentinel.parentElement;
  while (el) {
    if (el.hasAttribute("data-radix-scroll-area-viewport")) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * IntersectionObserver sentinel for infinite-scroll lists.
 * Prefer an explicit ScrollArea / overflow root so the sentinel is not tied to the wrong window.
 */
export function ListScrollSentinel({
  onVisible,
  scrollAreaRef,
  rootRef,
  disabled = false,
  className,
}: ListScrollSentinelProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  useEffect(() => {
    if (disabled) {
      return;
    }
    const node = sentinelRef.current;
    if (!node) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const root = resolveObserverRoot(node, scrollAreaRef, rootRef);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onVisibleRef.current();
        }
      },
      { root, rootMargin: "120px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [disabled, rootRef, scrollAreaRef]);

  return (
    <div
      ref={sentinelRef}
      className={cn("h-px w-full shrink-0", className)}
      aria-hidden
      data-list-scroll-sentinel=""
    />
  );
}
