import * as React from "react";

export type PortalContainer = Element | DocumentFragment | null | undefined;

const PortalContainerContext = React.createContext<PortalContainer>(undefined);

/** Optional portal host for Radix / createPortal overlays (e.g. extension shadow DOM). */
export function PortalContainerProvider({
  container,
  children,
}: {
  container: PortalContainer;
  children: React.ReactNode;
}) {
  return (
    <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>
  );
}

/** Resolves override container, or `undefined` so Radix keeps its document.body default. */
export function usePortalContainer(
  containerProp?: PortalContainer,
): Element | DocumentFragment | undefined {
  const fromContext = React.useContext(PortalContainerContext);
  const resolved = containerProp !== undefined ? containerProp : fromContext;
  return resolved ?? undefined;
}
