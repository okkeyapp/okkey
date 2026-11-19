/** Stable DOM anchors for the first-sign-in product tour. */
export const PRODUCT_TOUR_ANCHOR = {
  createItem: "create-item",
  accountMenu: "account-menu",
  mySettings: "my-settings",
  deviceSettings: "device-settings",
  workspaceSettings: "workspace-settings",
} as const;

export type ProductTourAnchorId =
  (typeof PRODUCT_TOUR_ANCHOR)[keyof typeof PRODUCT_TOUR_ANCHOR];

export function productTourAnchorSelector(anchor: ProductTourAnchorId): string {
  return `[data-tour-anchor="${anchor}"]`;
}
