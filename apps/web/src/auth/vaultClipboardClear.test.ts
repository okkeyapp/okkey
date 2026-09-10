import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./vaultDevicePrefs", () => ({
  readVaultDevicePrefs: vi.fn(() => ({
    lockOnDeviceSleep: true,
    clipboardClearSeconds: 10,
    requireReauthZones: [],
    pinEnabled: false,
    biometricEnabled: false,
  })),
}));

import {
  _resetVaultClipboardClearForTests,
  scheduleClipboardClearAfterCopy,
} from "./vaultClipboardClear";

describe("scheduleClipboardClearAfterCopy", () => {
  const userId = "user-clipboard-clear";

  beforeEach(() => {
    _resetVaultClipboardClearForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    _resetVaultClipboardClearForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("arms deferred ClipboardItem clear during the copy gesture", async () => {
    let deferredBlob: Promise<Blob> | null = null;
    const write = vi.fn(async (items: Array<{ getType: (t: string) => Promise<Blob> }>) => {
      deferredBlob = items[0]!.getType("text/plain");
      await deferredBlob;
    });

    vi.stubGlobal(
      "ClipboardItem",
      class {
        #data: Record<string, Blob | Promise<Blob>>;
        types: string[];
        constructor(data: Record<string, Blob | Promise<Blob>>) {
          this.#data = data;
          this.types = Object.keys(data);
        }
        getType(type: string) {
          return Promise.resolve(this.#data[type] as Blob | Promise<Blob>);
        }
      },
    );
    vi.stubGlobal("navigator", {
      clipboard: {
        write,
        writeText: vi.fn(async () => undefined),
        readText: vi.fn(async () => "secret-password"),
      },
    });

    scheduleClipboardClearAfterCopy(userId, "secret-password");
    expect(write).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    const blob = await deferredBlob!;
    expect(blob).toBeInstanceOf(Blob);
    expect(await blob.text()).toBe(" ");
  });

  it("does not clear when clipboard content changed", async () => {
    let itemPromise: Promise<Blob> | null = null;
    const write = vi.fn(async (items: Array<{ getType: (t: string) => Promise<Blob> }>) => {
      itemPromise = items[0]!.getType("text/plain");
      await itemPromise;
    });
    vi.stubGlobal(
      "ClipboardItem",
      class {
        #data: Record<string, Blob | Promise<Blob>>;
        types: string[];
        constructor(data: Record<string, Blob | Promise<Blob>>) {
          this.#data = data;
          this.types = Object.keys(data);
        }
        getType(type: string) {
          return Promise.resolve(this.#data[type] as Blob | Promise<Blob>);
        }
      },
    );
    vi.stubGlobal("navigator", {
      clipboard: {
        write,
        writeText: vi.fn(async () => undefined),
        readText: vi.fn(async () => "something-else"),
      },
    });

    scheduleClipboardClearAfterCopy(userId, "secret-password");
    expect(write).toHaveBeenCalledTimes(1);
    const writeResult = write.mock.results[0]?.value as Promise<unknown>;
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(writeResult).rejects.toBeInstanceOf(DOMException);
    await expect(itemPromise!).rejects.toBeInstanceOf(DOMException);
  });
});
