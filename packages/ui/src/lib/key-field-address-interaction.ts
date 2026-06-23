export function isKeyFieldAddressInteractionTarget(element: Element | null | undefined): boolean {
  if (!element) {
    return false;
  }

  return Boolean(
    element.closest("[data-key-field-address-panel]") ||
      element.closest("[data-key-field-address-popover]"),
  );
}
