/** PKCE helpers (S256) for extension ↔ web session handoff. */

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

export function generateRandomString(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function createPkcePair(): Promise<{
  state: string;
  codeVerifier: string;
  codeChallenge: string;
}> {
  const state = generateRandomString(24);
  const codeVerifier = generateRandomString(32);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  return { state, codeVerifier, codeChallenge };
}

export const EXTENSION_AUTH_CLIENT_ID = "okkey_extension";

export function buildExtensionAuthStartUrl(input: {
  webBaseUrl: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL("/auth/extension/start", input.webBaseUrl.replace(/\/$/, "") + "/");
  url.searchParams.set("client_id", EXTENSION_AUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/** Extension PKCE callback page (must be listed in web_accessible_resources). */
export const EXTENSION_AUTH_CALLBACK_PATH = "auth-callback.html";

/**
 * Absolute chrome-extension:// / moz-extension:// callback URL for this install.
 * Unpacked Chromium IDs change per load path — always derive via runtime.getURL,
 * never hardcode an extension id.
 */
export function getExtensionCallbackUrl(): string {
  // Path must be relative to the extension root (no leading slash) so getURL
  // resolves against the real extension id, not chrome-extension://invalid/.
  const url = browser.runtime.getURL(EXTENSION_AUTH_CALLBACK_PATH);
  if (!url || url.includes("://invalid")) {
    throw new Error(
      "Could not resolve extension callback URL (invalid extension id). Reload the unpacked extension and try again.",
    );
  }
  return url;
}
