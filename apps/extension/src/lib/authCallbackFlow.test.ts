import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AUTH_CALLBACK_ERROR_KEY,
  AUTH_CALLBACK_SESSION_READY_KEY,
  completeExtensionAuthCallback,
} from "./authCallbackFlow.ts";
import type { ExtensionPkcePending, ExtensionSession } from "./storage.ts";

const EN_LOCALE = new URL("../../../../packages/i18n/src/locales/web/en.json", import.meta.url);

function englishCopy(): Record<string, string> {
  return JSON.parse(readFileSync(EN_LOCALE, "utf8")) as Record<string, string>;
}

function pending(state = "expected-state"): ExtensionPkcePending {
  return {
    state,
    codeVerifier: "verifier",
    redirectUri: "chrome-extension://abcdefghijklmnop/auth-callback.html",
    webBaseUrl: "https://vault.example",
    apiBaseUrl: "https://vault.example",
    createdAt: 1,
  };
}

test("callback without a started login does not create a session (QA extension PKCE)", async () => {
  let persisted = 0;
  const result = await completeExtensionAuthCallback({
    code: "auth-code",
    state: "any-state",
    readPending: async () => null,
    exchange: async () => {
      throw new Error("exchange must not run");
    },
    persistSession: async () => {
      persisted += 1;
    },
  });
  assert.deepEqual(result, { ok: false, errorKey: AUTH_CALLBACK_ERROR_KEY.noPending });
  assert.equal(persisted, 0);
  assert.equal(englishCopy()[AUTH_CALLBACK_SESSION_READY_KEY], "Session ready");
});

test(
  'QA extension PKCE quotes the missing-login error as "no pending login in the extension, start again from popup"',
  { todo: true },
  () => {
    assert.equal(
      englishCopy()[AUTH_CALLBACK_ERROR_KEY.noPending],
      "no pending login in the extension, start again from popup",
    );
  },
);

test("mismatched state does not create a session (QA extension PKCE)", async () => {
  let exchanged = 0;
  let persisted = 0;
  const result = await completeExtensionAuthCallback({
    code: "auth-code",
    state: "attacker-state",
    readPending: async () => pending("expected-state"),
    exchange: async () => {
      exchanged += 1;
      throw new Error("exchange must not run");
    },
    persistSession: async () => {
      persisted += 1;
    },
  });
  assert.deepEqual(result, { ok: false, errorKey: AUTH_CALLBACK_ERROR_KEY.stateMismatch });
  assert.equal(exchanged, 0);
  assert.equal(persisted, 0);
});

test(
  'QA extension PKCE quotes the state error as "state mismatch — possible CSRF, start again"',
  { todo: true },
  () => {
    assert.equal(
      englishCopy()[AUTH_CALLBACK_ERROR_KEY.stateMismatch],
      "state mismatch — possible CSRF, start again",
    );
  },
);

test("valid callback exchanges the code and persists the session (QA extension PKCE)", async () => {
  const session: ExtensionSession = {
    access_token: "access-token",
    user_id: "user-1",
    expires_at: "2099-01-01T00:00:00.000Z",
  };
  const stored: ExtensionSession[] = [];
  const result = await completeExtensionAuthCallback({
    code: " auth-code ",
    state: " expected-state ",
    readPending: async () => pending(),
    exchange: async (row, code) => {
      assert.equal(row.state, "expected-state");
      assert.equal(code, "auth-code");
      return session;
    },
    persistSession: async (next) => {
      stored.push(next);
    },
  });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(stored, [session]);
  assert.equal(englishCopy()[AUTH_CALLBACK_SESSION_READY_KEY], "Session ready");
});

test("callback page persists a session only after completeExtensionAuthCallback succeeds", () => {
  const page = readFileSync(
    new URL("../entrypoints/auth-callback/AuthCallbackApp.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /completeExtensionAuthCallback/);
  assert.match(page, /if \(!result\.ok\)/);
  const persist = page.indexOf("persistSession:");
  const successGate = page.indexOf("if (!result.ok)");
  assert.ok(persist > 0 && successGate > persist);
  assert.match(page, /extension\.authCallback\.sessionReady/);
});

test(
  'QA extension PKCE: success page text is "Session ready"',
  { todo: true },
  () => {
    const page = readFileSync(
      new URL("../entrypoints/auth-callback/AuthCallbackApp.tsx", import.meta.url),
      "utf8",
    );
    assert.match(page, /setMessage\(t\("extension\.authCallback\.sessionReady"\)\)/);
  },
);
