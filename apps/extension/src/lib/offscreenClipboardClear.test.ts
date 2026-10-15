import assert from "node:assert/strict";
import test from "node:test";

import {
  clearOffscreenClipboardIfMatches,
  tryReadClipboardText,
  tryReadClipboardTextViaExecCommandPaste,
  writeClipboardTextViaExecCommand,
} from "./offscreenClipboardClear.ts";

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

function installDocumentExecCommand(opts: {
  execCommandResult?: boolean;
  pasteValue?: string;
  onExecCommand?: (command: string, value: string) => void;
}): () => void {
  const previousDocument = (globalThis as { document?: Document }).document;
  const nodes: Array<{ value: string }> = [];
  const body = {
    appendChild(node: { value: string }) {
      nodes.push(node);
      return node;
    },
    removeChild(node: { value: string }) {
      const idx = nodes.indexOf(node);
      if (idx >= 0) nodes.splice(idx, 1);
      return node;
    },
  };
  const documentStub = {
    body,
    createElement(tag: string) {
      assert.equal(tag, "textarea");
      return {
        value: "",
        setAttribute() {},
        style: { cssText: "" },
        focus() {},
        select() {},
      };
    },
    execCommand(command: string) {
      const node = nodes[nodes.length - 1];
      if (command === "paste" && opts.pasteValue !== undefined && node) {
        node.value = opts.pasteValue;
      }
      const value = node?.value ?? "";
      opts.onExecCommand?.(command, value);
      return opts.execCommandResult ?? true;
    },
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentStub,
  });
  return () => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: previousDocument,
    });
  };
}

test("tryReadClipboardText returns null when Async Clipboard API fails and paste fails", async () => {
  const restoreNav = installNavigatorClipboard({
    async readText() {
      throw new Error("Failed to execute 'readText' on 'Clipboard': Document is not focused.");
    },
  });
  const restoreDoc = installDocumentExecCommand({
    execCommandResult: false,
  });
  try {
    assert.equal(await tryReadClipboardText(), null);
  } finally {
    restoreDoc();
    restoreNav();
  }
});

test("tryReadClipboardText returns clipboard contents when readable via Async API", async () => {
  const restore = installNavigatorClipboard({
    async readText() {
      return "secret-login";
    },
  });
  try {
    assert.equal(await tryReadClipboardText(), "secret-login");
  } finally {
    restore();
  }
});

test("tryReadClipboardText falls back to execCommand paste when Async API fails", async () => {
  const restoreNav = installNavigatorClipboard({
    async readText() {
      throw new Error("Document is not focused.");
    },
  });
  const restoreDoc = installDocumentExecCommand({
    pasteValue: "secret-via-paste",
  });
  try {
    assert.equal(await tryReadClipboardText(), "secret-via-paste");
  } finally {
    restoreDoc();
    restoreNav();
  }
});

test("tryReadClipboardTextViaExecCommandPaste returns pasted value", () => {
  const restore = installDocumentExecCommand({
    pasteValue: "pasted-secret",
  });
  try {
    assert.equal(tryReadClipboardTextViaExecCommandPaste(), "pasted-secret");
  } finally {
    restore();
  }
});

test("writeClipboardTextViaExecCommand copies via execCommand", () => {
  let copied = "";
  const restore = installDocumentExecCommand({
    onExecCommand(command, value) {
      assert.equal(command, "copy");
      copied = value;
    },
  });
  try {
    assert.equal(writeClipboardTextViaExecCommand("cleared"), true);
    assert.equal(copied, "cleared");
  } finally {
    restore();
  }
});

test("clearOffscreenClipboardIfMatches clears when paste reads matching secret", async () => {
  let copied = "";
  const restoreNav = installNavigatorClipboard({
    async readText() {
      throw new Error("Document is not focused.");
    },
    async writeText() {
      throw new Error("Document is not focused.");
    },
  });
  const restoreDoc = installDocumentExecCommand({
    pasteValue: "secret-login",
    onExecCommand(command, value) {
      if (command === "copy") {
        copied = value;
      }
    },
  });
  try {
    const result = await clearOffscreenClipboardIfMatches("secret-login", "tok-1");
    assert.deepEqual(result, { ok: true, cleared: true, token: "tok-1" });
    assert.equal(copied, " ");
  } finally {
    restoreDoc();
    restoreNav();
  }
});

test("clearOffscreenClipboardIfMatches skips clear when clipboard is unreadable", async () => {
  let copyCalled = false;
  const restoreNav = installNavigatorClipboard({
    async readText() {
      throw new Error("Document is not focused.");
    },
  });
  const restoreDoc = installDocumentExecCommand({
    execCommandResult: false,
    onExecCommand(command) {
      if (command === "copy") {
        copyCalled = true;
      }
    },
  });
  try {
    const result = await clearOffscreenClipboardIfMatches("secret-login", "tok-unreadable");
    assert.deepEqual(result, {
      ok: false,
      cleared: false,
      reason: "clipboard-unreadable",
    });
    assert.equal(copyCalled, false);
  } finally {
    restoreDoc();
    restoreNav();
  }
});

test("clearOffscreenClipboardIfMatches skips clear when clipboard changed", async () => {
  let execCalled = false;
  const restoreNav = installNavigatorClipboard({
    async readText() {
      return "user-replaced-content";
    },
  });
  const restoreDoc = installDocumentExecCommand({
    onExecCommand() {
      execCalled = true;
    },
  });
  try {
    const result = await clearOffscreenClipboardIfMatches("secret-login", "tok-2");
    assert.deepEqual(result, { ok: true, cleared: false, reason: "clipboard-changed" });
    assert.equal(execCalled, false);
  } finally {
    restoreDoc();
    restoreNav();
  }
});

test("clearOffscreenClipboardIfMatches skips clear when paste shows foreign text", async () => {
  let copied = "";
  const restoreNav = installNavigatorClipboard({
    async readText() {
      throw new Error("Document is not focused.");
    },
  });
  const restoreDoc = installDocumentExecCommand({
    pasteValue: "MY-OWN-TEXT",
    onExecCommand(command, value) {
      if (command === "copy") {
        copied = value;
      }
    },
  });
  try {
    const result = await clearOffscreenClipboardIfMatches("secret-login", "tok-foreign");
    assert.deepEqual(result, { ok: true, cleared: false, reason: "clipboard-changed" });
    assert.equal(copied, "");
  } finally {
    restoreDoc();
    restoreNav();
  }
});
