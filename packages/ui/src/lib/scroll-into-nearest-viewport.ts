import { getScrollAreaViewport } from "./popup-scroll-shadow.js";

/**
 * Scroll `element` into view inside the nearest Radix ScrollArea viewport (or
 * overflow:auto/scroll ancestor) without calling `Element.scrollIntoView`.
 *
 * `scrollIntoView` can scroll modal/page ancestors and yank floating popovers
 * off-screen; this helper only adjusts the local scroll container.
 */
export function scrollIntoNearestViewport(
  element: HTMLElement | null | undefined,
  options?: { block?: "start" | "center" | "end" | "nearest" },
): void {
  if (!element) {
    return;
  }

  const block = options?.block ?? "nearest";
  const viewport = findNearestScrollViewport(element);
  if (!viewport) {
    return;
  }

  const elementRect = element.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  const currentTop = viewport.scrollTop;
  const elementTopInViewport = elementRect.top - viewportRect.top + currentTop;
  const elementBottomInViewport = elementTopInViewport + element.offsetHeight;
  const visibleTop = currentTop;
  const visibleBottom = currentTop + viewport.clientHeight;

  let nextTop = currentTop;

  if (block === "center") {
    nextTop = elementTopInViewport - (viewport.clientHeight - element.offsetHeight) / 2;
  } else if (block === "start") {
    nextTop = elementTopInViewport;
  } else if (block === "end") {
    nextTop = elementBottomInViewport - viewport.clientHeight;
  } else if (elementTopInViewport < visibleTop) {
    nextTop = elementTopInViewport;
  } else if (elementBottomInViewport > visibleBottom) {
    nextTop = elementBottomInViewport - viewport.clientHeight;
  }

  const maxTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  viewport.scrollTop = Math.max(0, Math.min(nextTop, maxTop));
}

function findNearestScrollViewport(element: HTMLElement): HTMLElement | null {
  const scrollAreaRoot = element.closest<HTMLElement>("[data-radix-scroll-area-root], [data-slot='scroll-area']");
  if (scrollAreaRoot) {
    const fromRoot = getScrollAreaViewport(scrollAreaRoot);
    if (fromRoot) {
      return fromRoot;
    }
  }

  const fromAncestor = element.closest<HTMLElement>("[data-radix-scroll-area-viewport]");
  if (fromAncestor) {
    return fromAncestor;
  }

  let parent = element.parentElement;
  while (parent) {
    const style = window.getComputedStyle(parent);
    const overflowY = style.overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }

  return null;
}
