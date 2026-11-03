import { getScrollAreaViewport, readPopupScrollEdges, type PopupScrollEdges } from "@okkey/ui";
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

/** Top/bottom overflow edges for sticky popup header/footer shadows (web Popup pattern). */
export function useRadixScrollAreaScrollEdges(
  scrollAreaRef: RefObject<HTMLElement | null>,
): PopupScrollEdges {
  const [edges, setEdges] = useState<PopupScrollEdges>({ fromTop: false, fromBottom: false });

  useEffect(() => {
    const root = scrollAreaRef.current;
    if (!root) {
      return;
    }

    const viewport = getScrollAreaViewport(root);
    if (!viewport) {
      return;
    }

    const update = () => {
      setEdges(readPopupScrollEdges(viewport));
    };

    update();
    viewport.addEventListener("scroll", update, { passive: true });

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    resizeObserver?.observe(viewport);
    // Content growth (form load) changes scrollHeight without resizing the viewport.
    const content = viewport.firstElementChild;
    if (content instanceof HTMLElement) {
      resizeObserver?.observe(content);
    }

    return () => {
      viewport.removeEventListener("scroll", update);
      resizeObserver?.disconnect();
    };
  }, [scrollAreaRef]);

  return edges;
}
