/**
 * Extension popup shell is fixed 600×450 (`popup.css` / `PopupFrame`).
 * Overlay uses `p-4` (16px) — dialogs must stay within the padded host.
 */
export const EXTENSION_POPUP_DIALOG_LAYOUT = "desktop" as const;

/** PIN / form dialogs: under host width with comfortable side inset. */
export const EXTENSION_POPUP_DIALOG_WIDTH = 420;

/** Confirm dialogs (delete, copy-guard): compact, not full host width. */
export const EXTENSION_POPUP_CONFIRM_WIDTH = 360;
