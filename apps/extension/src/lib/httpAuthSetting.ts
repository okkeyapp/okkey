import { extensionLocalStorage } from "./extensionStorageApi.ts";

/** Extension-local. Missing key means off. Not written into the vault. */
export const HTTP_BASIC_AUTH_SETTING_KEY = "okkey.extension.httpBasicAuth.enabled";

export async function readHttpBasicAuthEnabled(): Promise<boolean> {
  const area = extensionLocalStorage();
  if (!area) {
    return false;
  }
  try {
    const bag = await area.get(HTTP_BASIC_AUTH_SETTING_KEY);
    return bag[HTTP_BASIC_AUTH_SETTING_KEY] === true;
  } catch {
    return false;
  }
}

export async function writeHttpBasicAuthEnabled(enabled: boolean): Promise<void> {
  const area = extensionLocalStorage();
  if (!area) {
    return;
  }
  await area.set({ [HTTP_BASIC_AUTH_SETTING_KEY]: enabled });
}
