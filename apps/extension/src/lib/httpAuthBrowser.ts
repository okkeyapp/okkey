import { decideHttpBasicAuth, type HttpAuthBlockingResponse } from "./httpAuthDecision.ts";
import {
  HTTP_AUTH_CONSENT_TIMEOUT_MS,
  HTTP_AUTH_PORT_PREFIX,
  isHttpAuthRuntimeMessage,
  parseHttpAuthDecision,
  parseHttpAuthReady,
  type HttpAuthConsentResult,
  type HttpAuthPromptView,
} from "./httpAuthMessages.ts";
import { HTTP_BASIC_AUTH_SETTING_KEY, readHttpBasicAuthEnabled } from "./httpAuthSetting.ts";
import { loadHttpAuthCandidates } from "./httpAuthVault.ts";

type AuthDetails = {
  url?: string;
  scheme?: string;
  isProxy?: boolean;
};

type AsyncAuthCallback = (response: HttpAuthBlockingResponse | Record<string, never>) => void;

type AuthListener = (
  details: AuthDetails,
  asyncCallback?: AsyncAuthCallback,
) => Promise<HttpAuthBlockingResponse | Record<string, never>> | undefined;

type AuthEvent = {
  addListener: (
    listener: AuthListener,
    filter: { urls: string[] },
    extraInfoSpec: string[],
  ) => void;
};

type PendingConsent = {
  view: HttpAuthPromptView;
  settled: boolean;
  windowId: number | null;
  timer: ReturnType<typeof setTimeout>;
  resolve: (result: HttpAuthConsentResult) => void;
};

const pendingById = new Map<string, PendingConsent>();

function isFirefoxBuild(): boolean {
  // Direct `import.meta.env.BROWSER` so the bundler inlines "firefox" or "chrome".
  return import.meta.env.BROWSER === "firefox";
}

function emptyResponse(): Record<string, never> {
  return {};
}

function settleConsent(challengeId: string, result: HttpAuthConsentResult): void {
  const pending = pendingById.get(challengeId);
  if (!pending || pending.settled) {
    return;
  }
  pending.settled = true;
  clearTimeout(pending.timer);
  pendingById.delete(challengeId);
  pending.resolve(result);
  const windowId = pending.windowId;
  if (windowId != null) {
    void browser.windows.remove(windowId).catch(() => {
      // The user may already have closed the window.
    });
  }
}

function requestHttpAuthConsent(view: HttpAuthPromptView): Promise<HttpAuthConsentResult> {
  const challengeId = crypto.randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      settleConsent(challengeId, { outcome: "timeout" });
    }, HTTP_AUTH_CONSENT_TIMEOUT_MS);
    const pending: PendingConsent = {
      view,
      settled: false,
      windowId: null,
      timer,
      resolve,
    };
    pendingById.set(challengeId, pending);
    const pageUrl = browser.runtime.getURL("http-auth-prompt.html");
    const url = `${pageUrl}?challenge=${encodeURIComponent(challengeId)}`;
    void browser.windows
      .create({
        url,
        type: "popup",
        width: 420,
        height: 560,
        focused: true,
      })
      .then((created) => {
        if (pending.settled) {
          if (created?.id != null) {
            void browser.windows.remove(created.id).catch(() => undefined);
          }
          return;
        }
        pending.windowId = created?.id ?? null;
      })
      .catch(() => {
        settleConsent(challengeId, { outcome: "closed" });
      });
  });
}

export function handleHttpAuthRuntimeMessage(
  message: unknown,
): Promise<{ ok: boolean; prompt?: HttpAuthPromptView }> | undefined {
  const ready = parseHttpAuthReady(message);
  if (ready) {
    const pending = pendingById.get(ready.challengeId);
    if (!pending || pending.settled) {
      return Promise.resolve({ ok: false });
    }
    return Promise.resolve({ ok: true, prompt: pending.view });
  }
  const decision = parseHttpAuthDecision(message);
  if (decision) {
    settleConsent(decision.challengeId, decision.result);
    return Promise.resolve({ ok: true });
  }
  if (isHttpAuthRuntimeMessage(message)) {
    return Promise.resolve({ ok: false });
  }
  return undefined;
}

function logHttpAuth(line: string): void {
  // Fixed phrases from decideHttpBasicAuth. Never pass request headers or passwords here.
  console.info(`[okkey] ${line}`);
}

function onAuthRequired(
  details: AuthDetails,
  asyncCallback: AsyncAuthCallback | undefined,
  enabled: boolean,
): Promise<HttpAuthBlockingResponse | Record<string, never>> | undefined {
  if (!enabled) {
    // Setting off: supply nothing. Chrome's asyncBlocking listener must still
    // settle the callback or the browser waits; an empty response shows the native dialog.
    if (typeof asyncCallback === "function") {
      asyncCallback(emptyResponse());
    }
    return undefined;
  }

  const task = decideHttpBasicAuth({
    enabled: true,
    details,
    findMatches: loadHttpAuthCandidates,
    requestConsent: requestHttpAuthConsent,
    log: logHttpAuth,
  }).then((response) => response ?? emptyResponse());

  if (typeof asyncCallback === "function") {
    // Chromium MV3: asyncBlocking ignores the return value (crbug 1510405).
    void task.then(asyncCallback).catch(() => {
      asyncCallback(emptyResponse());
    });
    return undefined;
  }

  // Firefox MV3: a blocking listener may return a Promise.
  return task.catch(() => emptyResponse());
}

function authRequiredEvent(): AuthEvent | null {
  const root = globalThis as {
    chrome?: { webRequest?: { onAuthRequired?: AuthEvent } };
    browser?: { webRequest?: { onAuthRequired?: AuthEvent } };
  };
  if (isFirefoxBuild()) {
    return root.browser?.webRequest?.onAuthRequired ?? null;
  }
  return root.chrome?.webRequest?.onAuthRequired ?? root.browser?.webRequest?.onAuthRequired ?? null;
}

/**
 * Register `onAuthRequired` for the life of the service worker.
 * The setting defaults to off. While it is off the listener does not open UI
 * and does not return credentials.
 *
 * Chromium: `asyncBlocking` plus the callback argument (`webRequestAuthProvider`).
 * Firefox: `blocking` plus a returned Promise (`webRequestBlocking`, Firefox 121+).
 */
export function wireHttpBasicAuth(): void {
  let enabled = false;
  void readHttpBasicAuthEnabled().then((value) => {
    enabled = value;
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") {
      return;
    }
    const change = changes[HTTP_BASIC_AUTH_SETTING_KEY];
    if (!change) {
      return;
    }
    enabled = change.newValue === true;
  });

  browser.runtime.onConnect.addListener((port) => {
    if (!port.name.startsWith(HTTP_AUTH_PORT_PREFIX)) {
      return;
    }
    const challengeId = port.name.slice(HTTP_AUTH_PORT_PREFIX.length);
    port.onDisconnect.addListener(() => {
      const pending = pendingById.get(challengeId);
      if (!pending || pending.settled) {
        return;
      }
      settleConsent(challengeId, { outcome: "closed" });
    });
  });

  const event = authRequiredEvent();
  if (!event) {
    return;
  }
  const extraInfoSpec = isFirefoxBuild() ? ["blocking"] : ["asyncBlocking"];
  event.addListener(
    (details, asyncCallback) => onAuthRequired(details, asyncCallback, enabled),
    { urls: ["<all_urls>"] },
    extraInfoSpec,
  );
}
