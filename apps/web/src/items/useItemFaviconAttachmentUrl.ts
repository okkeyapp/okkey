import { useItemFaviconAttachmentUrl as useItemFaviconAttachmentUrlWithBaseUrl } from "@okkey/vault-ui";

import { getApiBaseUrl } from "../api/client";

/** Thin wrapper over `@okkey/vault-ui`'s hook, injecting the web app's resolved API base URL. */
export function useItemFaviconAttachmentUrl(input: {
  accessToken: string | null;
  vaultKey: Uint8Array | null | undefined;
  vaultId?: string;
  itemId?: string;
  faviconId?: string;
  enabled?: boolean;
}): { imageSrc: string | undefined; loading: boolean } {
  return useItemFaviconAttachmentUrlWithBaseUrl({ apiBaseUrl: getApiBaseUrl(), ...input });
}
