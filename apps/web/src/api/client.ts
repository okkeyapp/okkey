import { ApiClient, createCoreApiClient, type CoreApiClient } from "@okkey/api";
import { AuthClient } from "@okkey/auth";

import { readStoredLocale } from "../locale/localeStorage";

const DEFAULT_API_BASE = "http://localhost:4000";

type OkkeyRuntimeConfig = {
  apiBaseUrl?: string;
};

declare global {
  interface Window {
    __OKKEY_RUNTIME__?: OkkeyRuntimeConfig;
  }
}

/**
 * Resolves the Core API origin. Rejects env typos like the literal string "undefined"
 * (relative fetch would hit the Vite dev server and return HTML instead of JSON).
 */
export function resolveApiBaseUrl(
  raw: string | undefined,
  onInvalid?: (message: string) => void,
): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    return DEFAULT_API_BASE;
  }
  const candidate = raw.trim().replace(/\/$/, "");
  const lowered = candidate.toLowerCase();
  if (lowered === "undefined" || lowered === "null") {
    onInvalid?.(
      `VITE_API_BASE_URL is the literal "${raw}"; using ${DEFAULT_API_BASE}. Set a real URL (e.g. http://localhost:4000).`,
    );
    return DEFAULT_API_BASE;
  }
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      onInvalid?.(`VITE_API_BASE_URL must use http or https; using ${DEFAULT_API_BASE}.`);
      return DEFAULT_API_BASE;
    }
    const pathPart = u.pathname.replace(/\/$/, "");
    if (pathPart && pathPart !== "/") {
      return `${u.origin}${pathPart}`;
    }
    return u.origin;
  } catch {
    onInvalid?.(`VITE_API_BASE_URL "${raw}" is not a valid URL; using ${DEFAULT_API_BASE}.`);
    return DEFAULT_API_BASE;
  }
}

function runtimeApiBaseUrl(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const value = window.__OKKEY_RUNTIME__?.apiBaseUrl;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export function getApiBaseUrl(): string {
  const warn = import.meta.env.DEV ? (msg: string) => console.warn(`[okkey] ${msg}`) : undefined;
  // Prefer Docker/self-host runtime config over build-time Vite env.
  return resolveApiBaseUrl(runtimeApiBaseUrl() ?? import.meta.env.VITE_API_BASE_URL, warn);
}

export function createPublicApiClient(): ApiClient {
  return new ApiClient({
    baseUrl: getApiBaseUrl(),
    defaultHeaders: { "Accept-Language": readStoredLocale() },
  });
}

export function createAuthSdk(api: ApiClient): AuthClient {
  return new AuthClient(api);
}

export function createAuthenticatedCoreClient(accessToken: string): CoreApiClient {
  const locale = readStoredLocale();
  return createCoreApiClient(getApiBaseUrl(), accessToken, {
    cryptoRolloutMode: "compat",
    defaultHeaders: { "Accept-Language": locale },
  });
}
