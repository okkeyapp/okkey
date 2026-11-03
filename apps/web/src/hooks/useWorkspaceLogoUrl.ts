import { useWorkspaceLogoUrl as useWorkspaceLogoUrlWithBaseUrl } from "@okkey/vault-ui";

import { getApiBaseUrl } from "../api/client";

/** Thin wrapper over `@okkey/vault-ui`'s hook, injecting the web app's resolved API base URL. */
export function useWorkspaceLogoUrl(input: {
  accessToken: string | null;
  vaultKey: Uint8Array | null;
  vaultId: string | null | undefined;
  attachmentId: string | null | undefined;
  workspaceId: string;
  enabled: boolean;
}): { imageSrc: string | undefined; loading: boolean } {
  return useWorkspaceLogoUrlWithBaseUrl({ apiBaseUrl: getApiBaseUrl(), ...input });
}
