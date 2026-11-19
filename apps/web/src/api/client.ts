import { ApiClient, createCoreApiClient, type CoreApiClient } from "@okkey/api";
import { AuthClient } from "@okkey/auth";

import { readStoredLocale } from "../locale/localeStorage";

export type ResolveApiBaseUrlOptions = {
  /**
   * Override the empty/invalid fallback. Tests pass an explicit value so the
   * production bundle can dead-code-eliminate the local-dev localhost default.
   */
  fallback?: string;
};

type OkkeyRuntimeConfig = {
  apiBaseUrl?: string;
};

declare global {
  interface Window {
    __OKKEY_RUNTIME__?: OkkeyRuntimeConfig;
  }
}

/**
 * Compile-time default: production → same-origin (`""`); development → local API.
 * Vite replaces `import.meta.env.PROD`, so the localhost literal is stripped from
 * production bundles (TSK-305).
 */
function compileTimeApiBaseFallback(): string {
  return import.meta.env.PROD ? "" : "http://localhost:4000";
}

/**
 * Resolves the Core API origin (also used for enterprise routes under the same base).
 * Rejects env typos like the literal string "undefined"
 * (relative fetch would hit the Vite dev server and return HTML instead of JSON).
 *
 * In production builds, an empty/missing value resolves to same-origin (`""`),
 * never to localhost. Development keeps the local API default.
 */
export function resolveApiBaseUrl(
  raw: string | undefined,
  onInvalid?: (message: string) => void,
  options?: ResolveApiBaseUrlOptions,
): string {
  const fallback = options?.fallback ?? compileTimeApiBaseFallback();

  if (typeof raw !== "string" || raw.trim() === "") {
    return fallback;
  }
  const candidate = raw.trim().replace(/\/$/, "");
  const lowered = candidate.toLowerCase();
  if (lowered === "undefined" || lowered === "null") {
    onInvalid?.(
      `VITE_API_BASE_URL is the literal "${raw}"; using ${fallback || "same-origin"}. Set a real API origin URL.`,
    );
    return fallback;
  }
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      onInvalid?.(
        `VITE_API_BASE_URL must use http or https; using ${fallback || "same-origin"}.`,
      );
      return fallback;
    }
    const pathPart = u.pathname.replace(/\/$/, "");
    if (pathPart && pathPart !== "/") {
      return `${u.origin}${pathPart}`;
    }
    return u.origin;
  } catch {
    onInvalid?.(
      `VITE_API_BASE_URL "${raw}" is not a valid URL; using ${fallback || "same-origin"}.`,
    );
    return fallback;
  }
}

/**
 * Reads runtime `apiBaseUrl` when the property is present (including empty string =
 * same-origin). Missing property means “no runtime override”.
 */
function runtimeApiBaseUrl(): { present: boolean; value: string | undefined } {
  if (typeof window === "undefined") {
    return { present: false, value: undefined };
  }
  const runtime = window.__OKKEY_RUNTIME__;
  if (!runtime || !Object.prototype.hasOwnProperty.call(runtime, "apiBaseUrl")) {
    return { present: false, value: undefined };
  }
  const value = runtime.apiBaseUrl;
  if (typeof value !== "string") {
    return { present: true, value: undefined };
  }
  return { present: true, value: value.trim() };
}

export function getApiBaseUrl(): string {
  const warn = import.meta.env.DEV ? (msg: string) => console.warn(`[okkey] ${msg}`) : undefined;
  // Prefer Docker/self-host runtime config over build-time Vite env.
  const runtime = runtimeApiBaseUrl();
  if (runtime.present) {
    // Explicit runtime override (including empty string → same-origin).
    if (runtime.value === undefined || runtime.value === "") {
      return "";
    }
    return resolveApiBaseUrl(runtime.value, warn);
  }
  return resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL, warn);
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
