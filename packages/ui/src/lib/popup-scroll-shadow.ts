import { cn } from "./utils.js";

export const popupChromeSurfaceClassName = "relative z-10 bg-background transition-shadow";

export function popupHeaderShadowClassName(active: boolean): string {
  return cn(
    active && "shadow-[0_1px_3px_rgba(0,0,0,0.1)] dark:shadow-[0_1px_0_0_rgb(255_255_255/0.12)]",
  );
}

export function popupFooterShadowClassName(active: boolean): string {
  return cn(
    active && "shadow-[0_-1px_3px_rgba(0,0,0,0.1)] dark:shadow-[0_-1px_0_0_rgb(255_255_255/0.12)]",
  );
}

export function getScrollAreaViewport(root: HTMLElement): HTMLElement | null {
  return root.querySelector("[data-radix-scroll-area-viewport]");
}

export type PopupScrollEdges = {
  fromTop: boolean;
  fromBottom: boolean;
};

export function readPopupScrollEdges(viewport: HTMLElement): PopupScrollEdges {
  const { scrollTop, scrollHeight, clientHeight } = viewport;
  const hasScroll = scrollHeight > clientHeight + 1;

  return {
    fromTop: hasScroll && scrollTop > 0,
    fromBottom: hasScroll && scrollTop + clientHeight < scrollHeight - 1,
  };
}
