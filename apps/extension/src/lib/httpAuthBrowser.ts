import {
  challengeIdFromHttpAuthAlarm,
  createHttpAuthConsentTracker,
  HTTP_AUTH_PENDING_SESSION_KEY,
  httpAuthTimeoutAlarmName,
  parseHttpAuthPendingBag,
  type HttpAuthConsentTracker,
  type HttpAuthPendingSession,
} from "./httpAuthConsentTimeout.ts";
import { decideHttpBasicAuth, type HttpAuthBlockingResponse } from "./httpAuthDecision.ts";
import { extensionSessionStorage } from "./extensionStorageApi.ts";
import {
  HTTP_AUTH_PORT_PREFIX,
  isHttpAuthRuntimeMessage,
  parseHttpAuthDecision,
  parseHttpAuthReady,
  parseHttpAuthTimeout,
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

const promptViews = new Map<string, HttpAuthPromptView>();
let consentTracker: HttpAuthConsentTracker | null = null;

function activeConsentTracker(): HttpAuthConsentTracker {
  if (!consentTracker) {
    consentTracker = createHttpAuthConsentTracker({
      now: () => Date.now(),
      setTimer: (callback, delayMs) => setTimeout(() => void callback(), delayMs),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      scheduleAlarm: (challengeId, whenMs) => {
        // Chromium delays alarms closer than ~30s and rejects periodInMinutes
        // below 1. The consent deadline is 90s, so this is an absolute `when`.
        void browser.alarms.create(httpAuthTimeoutAlarmName(challengeId), { when: whenMs }).catch(() => undefined);
      },
      clearAlarm: (challengeId) => {
        void browser.alarms.clear(httpAuthTimeoutAlarmName(challengeId)).catch(() => undefined);
      },
      closeWindow: (windowId) => {
        void browser.windows.remove(windowId).catch(() => undefined);
      },
      log: logHttpAuth,
      readPending: readConsentSession,
      writePending: writeConsentSession,
    });
  }
  return consentTracker;
}

async function readConsentSession(): Promise<Record<string, HttpAuthPendingSession>> {
  const area = extensionSessionStorage();
  if (!area) {
    return {};
  }
  const stored = await area.get(HTTP_AUTH_PENDING_SESSION_KEY);
  return parseHttpAuthPendingBag(stored[HTTP_AUTH_PENDING_SESSION_KEY]);
}

async function writeConsentSession(records: Record<string, HttpAuthPendingSession>): Promise<void> {
  const area = extensionSessionStorage();
  if (!area) {
    return;
  }
  if (Object.keys(records).length === 0) {
    await area.remove(HTTP_AUTH_PENDING_SESSION_KEY);
    return;
  }
  await area.set({ [HTTP_AUTH_PENDING_SESSION_KEY]: records });
}

function isFirefoxBuild(): boolean {
  // Direct `import.meta.env.BROWSER` so the bundler inlines "firefox" or "chrome".
  return import.meta.env.BROWSER === "firefox";
}

function emptyResponse(): Record<string, never> {
  return {};
}

function requestHttpAuthConsent(view: HttpAuthPromptView): Promise<HttpAuthConsentResult> {
  const challengeId = crypto.randomUUID();
  const tracker = activeConsentTracker();
  promptViews.set(challengeId, view);
  return new Promise((resolve) => {
    void tracker.open({
      challengeId,
      origin: view.origin,
      resolve: (result) => {
        promptViews.delete(challengeId);
        resolve(result);
      },
    });
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
        if (created?.id == null) {
          return;
        }
        void tracker.attachWindow(challengeId, created.id);
      })
      .catch(() => {
        void tracker.finish(challengeId, { outcome: "closed" });
      });
  });
}

export function handleHttpAuthRuntimeMessage(
  message: unknown,
): Promise<{ ok: boolean; prompt?: HttpAuthPromptView; deadlineMs?: number }> | undefined {
  const ready = parseHttpAuthReady(message);
  const decision = parseHttpAuthDecision(message);
  const timeout = parseHttpAuthTimeout(message);
  const challengeId = ready?.challengeId ?? decision?.challengeId ?? timeout?.challengeId ?? null;
  if (!challengeId) {
    if (isHttpAuthRuntimeMessage(message)) {
      return Promise.resolve({ ok: false });
    }
    return undefined;
  }
  const tracker = activeConsentTracker();
  return (async () => {
    if (timeout) {
      await tracker.forceTimeout(challengeId);
      return { ok: true };
    }
    const state = await tracker.onActivity(challengeId);
    if (state === "expired") {
      return { ok: false };
    }
    if (ready) {
      const view = promptViews.get(challengeId);
      const deadlineMs = tracker.getDeadline(challengeId);
      if (!view || deadlineMs == null) {
        return { ok: false };
      }
      return { ok: true, prompt: view, deadlineMs };
    }
    if (decision) {
      await tracker.finish(challengeId, decision.result);
      return { ok: true };
    }
    return { ok: false };
  })();
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
  const tracker = activeConsentTracker();
  // A Firefox event page starts from scratch after suspend. The stored
  // deadline closes a consent window whose setTimeout did not survive.
  const onWake = (): void => {
    void tracker.restoreLostTimers().catch(() => undefined);
  };
  onWake();
  try {
    browser.windows.onFocusChanged.addListener(() => {
      onWake();
    });
  } catch {
    // The consent window checks the same deadline if this listener is missing.
  }
  try {
    browser.idle?.onStateChanged.addListener(() => {
      onWake();
    });
  } catch {
    // Idle is optional. The consent window still compares the wall-clock deadline.
  }
  browser.alarms.onAlarm.addListener((alarm) => {
    const challengeId = challengeIdFromHttpAuthAlarm(alarm.name);
    if (!challengeId) {
      return;
    }
    void tracker.onAlarm(challengeId);
  });

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
      void tracker.finish(challengeId, { outcome: "closed" });
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
