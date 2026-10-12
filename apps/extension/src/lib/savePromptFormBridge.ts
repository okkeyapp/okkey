/** postMessage bridge between content-script overlay iframe and save-prompt-form page. */

export const SAVE_PROMPT_FORM_MSG = {
  ready: "okkey.savePromptForm.ready",
  init: "okkey.savePromptForm.init",
  close: "okkey.savePromptForm.close",
  saved: "okkey.savePromptForm.saved",
  cancel: "okkey.savePromptForm.cancel",
} as const;

export type SavePromptFormKind = "create" | "update";

export type SavePromptFormQuery = {
  kind: SavePromptFormKind;
  title: string;
  username: string;
  password: string;
  websiteUrl: string;
  vaultId?: string;
  itemId?: string;
};

export function buildSavePromptFormUrl(): string {
  return browser.runtime.getURL("/save-prompt-form.html");
}

export function isSavePromptFormMessage(
  data: unknown,
): data is { type: string; source: "okkey-save-prompt-form"; payload?: SavePromptFormQuery } {
  return Boolean(
    data &&
      typeof data === "object" &&
      (data as { source?: string }).source === "okkey-save-prompt-form" &&
      typeof (data as { type?: unknown }).type === "string",
  );
}
