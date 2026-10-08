export function isKeyFieldDatePickerInteractionTarget(element: Element | null | undefined): boolean {
  if (!element) {
    return false;
  }

  return Boolean(
    element.closest("[data-key-field-date-picker-panel]") ||
      element.closest("[data-radix-select-viewport]") ||
      element.closest("[data-radix-select-content]") ||
      element.closest("[data-radix-popper-content-wrapper]") ||
      element.closest('[role="listbox"]') ||
      element.closest('[role="combobox"][data-state="open"]') ||
      element.closest('[role="combobox"][aria-expanded="true"]') ||
      element.closest('[aria-expanded="true"][aria-haspopup="listbox"]'),
  );
}
