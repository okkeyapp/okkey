import { ApiClient, createCoreApiClient, type CoreApiClient } from "@okkey/api";
import { AuthClient } from "@okkey/auth";
import type { AccessTokenResponseDto } from "@okkey/types";

import { EXTENSION_AUTH_CLIENT_ID } from "./pkce";
import type { ExtensionSession } from "./storage";

export function createPublicApi(apiBaseUrl: string): ApiClient {
  return new ApiClient({ baseUrl: apiBaseUrl.replace(/\/$/, "") });
}

export function createAuthClient(apiBaseUrl: string, accessToken?: string): AuthClient {
  const api = accessToken
    ? new ApiClient({
        baseUrl: apiBaseUrl.replace(/\/$/, ""),
        defaultHeaders: { Authorization: `Bearer ${accessToken}` },
      })
    : createPublicApi(apiBaseUrl);
  return new AuthClient(api);
}

export function createCoreClient(apiBaseUrl: string, accessToken: string): CoreApiClient {
  return createCoreApiClient(apiBaseUrl.replace(/\/$/, ""), accessToken, {
    cryptoRolloutMode: "compat",
  });
}

export async function exchangeExtensionAuthCode(input: {
  apiBaseUrl: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<ExtensionSession> {
  const auth = createAuthClient(input.apiBaseUrl);
  const dto: AccessTokenResponseDto = await auth.exchangeExtensionAuthToken({
    client_id: EXTENSION_AUTH_CLIENT_ID,
    redirect_uri: input.redirectUri,
    code: input.code,
    code_verifier: input.codeVerifier,
  });
  return {
    access_token: dto.access_token,
    user_id: dto.user_id,
    expires_at: dto.expires_at,
  };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/** Random placeholder device public key (base64). Server validates encoding only at register. */
export function randomDevicePublicKeyB64(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

export function randomDeviceShareB64(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}
