/** Cross-pane signal when trusted/pending/blocked device lists change. */
export const DEVICES_CHANGED_EVENT = "okkey:devices-changed";

export function emitDevicesChanged(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(DEVICES_CHANGED_EVENT));
}
