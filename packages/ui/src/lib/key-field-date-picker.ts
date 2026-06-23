export function isKeyFieldDatePickerInteractionTarget(element: Element | null | undefined): boolean {
  if (!element) {
    return false;
  }

  return Boolean(
    element.closest("[data-key-field-date-picker-panel]") ||
      element.closest("[data-radix-select-viewport]") ||
      element.closest('[role="listbox"]'),
  );
}
