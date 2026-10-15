/**
 * Preflight reachability check for the self-hosted web Base URL
 * before opening the extension auth tab.
 */

/** Thrown when the web origin does not respond (connection refused, timeout, DNS, etc.). */
export const WEB_BASE_URL_UNREACHABLE_ERROR = "Server is unreachable";

const DEFAULT_TIMEOUT_MS = 4_000;

export type ProbeWebBaseUrlOptions = {
  timeoutMs?: number;
  /** Injectable for unit tests. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
};

/**
 * Probe that the configured web origin answers over HTTP.
 * Any HTTP response (including 4xx/5xx) means the host is reachable;
 * network failures and aborts mean unreachable.
 */
export async function probeWebBaseUrl(
  webBaseUrl: string,
  options?: ProbeWebBaseUrlOptions,
): Promise<void> {
  const origin = new URL(webBaseUrl).origin;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchFn = options?.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetchFn(`${origin}/`, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
    });
  } catch {
    throw new Error(WEB_BASE_URL_UNREACHABLE_ERROR);
  } finally {
    clearTimeout(timer);
  }
}
