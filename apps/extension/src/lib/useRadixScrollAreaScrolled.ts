import { getScrollAreaViewport } from "@okkey/ui";
import { useEffect, useState, type RefObject } from "react";

/** True when a Radix ScrollArea viewport under `scrollAreaRef` has scrollTop > threshold. */
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

    const viewport = getScrollAreaViewport(root);
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
