import assert from "node:assert/strict";
import test from "node:test";

import {
  clearOffscreenClipboardIfMatches,
  tryReadClipboardText,
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
      const value = nodes[nodes.length - 1]?.value ?? "";
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

test("tryReadClipboardText returns null when Async Clipboard API fails (unfocused)", async () => {
  const restore = installNavigatorClipboard({
    async readText() {
      throw new Error("Failed to execute 'readText' on 'Clipboard': Document is not focused.");
    },
  });
  try {
    assert.equal(await tryReadClipboardText(), null);
  } finally {
    restore();
  }
});

test("tryReadClipboardText returns clipboard contents when readable", async () => {
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

test("clearOffscreenClipboardIfMatches clears via execCommand when readText is unfocused", async () => {
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
    onExecCommand(command, value) {
      assert.equal(command, "copy");
      copied = value;
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
