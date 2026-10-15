import assert from "node:assert/strict";
import test from "node:test";

import {
  canUseBackgroundClipboardApi,
  clearBackgroundClipboardIfMatches,
} from "./backgroundClipboardClear.ts";

type ClipboardStub = {
  readText?: () => Promise<string>;
  writeText?: (text: string) => Promise<void>;
};

function installNavigatorClipboard(clipboard: ClipboardStub | undefined): () => void {
  const previous = (globalThis as { navigator?: Navigator }).navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: clipboard ? { clipboard } : {},
  });
  return () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: previous,
    });
  };
}

test("canUseBackgroundClipboardApi is false without clipboard methods", () => {
  const restore = installNavigatorClipboard(undefined);
  try {
    assert.equal(canUseBackgroundClipboardApi(), false);
  } finally {
    restore();
  }
});

test("clearBackgroundClipboardIfMatches clears when text still matches", async () => {
  let written = "";
  const restore = installNavigatorClipboard({
    async readText() {
      return "secret-login";
    },
    async writeText(text) {
      written = text;
    },
  });
  try {
    const result = await clearBackgroundClipboardIfMatches("secret-login");
    assert.deepEqual(result, { handled: true, cleared: true });
    assert.equal(written, " ");
  } finally {
    restore();
  }
});

test("clearBackgroundClipboardIfMatches skips foreign clipboard text", async () => {
  let writeCalled = false;
  const restore = installNavigatorClipboard({
    async readText() {
      return "MY-OWN-TEXT";
    },
    async writeText() {
      writeCalled = true;
    },
  });
  try {
    const result = await clearBackgroundClipboardIfMatches("secret-login");
    assert.deepEqual(result, {
      handled: true,
      cleared: false,
      reason: "clipboard-changed",
    });
    assert.equal(writeCalled, false);
  } finally {
    restore();
  }
});

test("clearBackgroundClipboardIfMatches reports unhandled when read throws", async () => {
  const restore = installNavigatorClipboard({
    async readText() {
      throw new Error("denied");
    },
    async writeText() {},
  });
  try {
    const result = await clearBackgroundClipboardIfMatches("secret-login");
    assert.equal(result.handled, false);
    assert.equal(result.cleared, false);
    assert.equal(result.error, "denied");
  } finally {
    restore();
  }
});
