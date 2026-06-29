import { useEffect, useState, type RefObject } from "react";

function getRadixScrollAreaViewport(root: HTMLElement): HTMLElement | null {
  return root.querySelector("[data-radix-scroll-area-viewport]");
}

export function useRadixScrollAreaScrolled(
  scrollAreaRef: RefObject<HTMLElement | null>,
  threshold = 0,
): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const root = scrollAreaRef.current;
    if (!root) {
      return;
    }

    const viewport = getRadixScrollAreaViewport(root);
    if (!viewport) {
      return;
    }

    const onScroll = () => {
      setScrolled(viewport.scrollTop > threshold);
    };

    onScroll();
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [scrollAreaRef, threshold]);

  return scrolled;
}

export function useScrollAncestorScrolled(
  elementRef: RefObject<HTMLElement | null>,
  threshold = 0,
  /** Re-bind scroll listener when ref target mounts (e.g. after loading gate). */
  rebindKey?: string | number | boolean,
): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const start = elementRef.current;
    if (!start) {
      setScrolled(false);
      return;
    }

    let viewport: HTMLElement | null = start;
    while (viewport && !viewport.hasAttribute("data-radix-scroll-area-viewport")) {
      viewport = viewport.parentElement;
    }

    if (!viewport) {
      setScrolled(false);
      return;
    }

    const onScroll = () => {
      setScrolled(viewport.scrollTop > threshold);
    };

    onScroll();
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [elementRef, threshold, rebindKey]);

  return scrolled;
}
