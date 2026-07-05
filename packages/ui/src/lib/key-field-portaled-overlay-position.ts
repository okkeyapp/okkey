export type KeyFieldOverlayPlacement = "top" | "bottom";

export type KeyFieldPortaledOverlayCoords = {
  top: number;
  left: number;
  placement: KeyFieldOverlayPlacement;
};

const VIEWPORT_PADDING_PX = 8;
const ANCHOR_GAP_PX = 8;

export function getScrollableAncestors(element: HTMLElement | null): HTMLElement[] {
  const ancestors: HTMLElement[] = [];
  let parent = element?.parentElement ?? null;

  while (parent) {
    const style = window.getComputedStyle(parent);
    const overflow = `${style.overflow} ${style.overflowY} ${style.overflowX}`;
    if (/(auto|scroll|overlay)/.test(overflow)) {
      ancestors.push(parent);
    }
    parent = parent.parentElement;
  }

  return ancestors;
}

export function computeKeyFieldPortaledOverlayPosition(input: {
  anchorRect: DOMRect;
  panelRect: DOMRect;
  viewportPadding?: number;
  gap?: number;
}): KeyFieldPortaledOverlayCoords {
  const viewportPadding = input.viewportPadding ?? VIEWPORT_PADDING_PX;
  const gap = input.gap ?? ANCHOR_GAP_PX;

  const spaceBelow = window.innerHeight - input.anchorRect.bottom - viewportPadding;
  const spaceAbove = input.anchorRect.top - viewportPadding;
  const panelHeight = input.panelRect.height;

  let placement: KeyFieldOverlayPlacement = "bottom";
  if (panelHeight > spaceBelow && spaceAbove >= panelHeight && spaceAbove > spaceBelow) {
    placement = "top";
  } else if (panelHeight > spaceBelow && spaceAbove > spaceBelow) {
    placement = "top";
  }

  const top =
    placement === "bottom"
      ? input.anchorRect.bottom + gap
      : Math.max(viewportPadding, input.anchorRect.top - panelHeight - gap);

  let left = input.anchorRect.left;
  const maxLeft = window.innerWidth - input.panelRect.width - viewportPadding;
  left = Math.max(viewportPadding, Math.min(left, maxLeft));

  return { top, left, placement };
}
