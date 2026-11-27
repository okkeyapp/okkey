/**
 * Regression: web unlock keeps vault key material in memory only.
 * Unlock / lock / idle must not write vault_key_b64 or password_share_c_b64 to Web Storage.
 */
import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthVaultProvider, DEFAULT_IDLE_MS, useAuthVault } from "./AuthVaultContext";
import { LocaleProvider } from "../locale/LocaleContext";
import { SESSION_STORAGE_KEY, VAULT_UNLOCK_TAB_KEY } from "./storageKeys";
import { patchVaultDevicePrefs } from "./vaultDevicePrefs";
import { vaultIdleExceeded } from "./vaultUnlockSessionStorage";

const FORBIDDEN = ["vault_key_b64", "password_share_c_b64"] as const;

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

function storageHasForbiddenSecrets(): boolean {
  for (const storage of [sessionStorage, localStorage]) {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key) continue;
      const value = storage.getItem(key) ?? "";
      for (const marker of FORBIDDEN) {
        if (key.includes(marker) || value.includes(marker)) {
          return true;
        }
      }
    }
  }
  return false;
}

function Probe({
  onReady,
}: {
  onReady: (api: ReturnType<typeof useAuthVault>) => void;
}) {
  const api = useAuthVault();
  onReady(api);
  return null;
}

describe("web vault unlock memory-only security", () => {
  let latest: ReturnType<typeof useAuthVault> | null = null;

  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
    latest = null;
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        access_token: "test-token",
        user_id: "1156820912149601",
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ error: "NOT_FOUND", message: "not found", requestId: "t" }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function renderProvider() {
    return render(
      <MemoryRouter>
        <LocaleProvider>
          <AuthVaultProvider>
            <Probe
              onReady={(api) => {
                latest = api;
              }}
            />
          </AuthVaultProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );
  }

  it("starts locked, unlock stays out of Web Storage, lock clears leftovers, idle needs no storage", async () => {
    const legacyKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    const legacyKeyB64 = btoa(String.fromCharCode(...legacyKeyBytes));
    sessionStorage.setItem(
      VAULT_UNLOCK_TAB_KEY,
      JSON.stringify({
        v: 1,
        user_id: "1156820912149601",
        vault_key_b64: legacyKeyB64,
        last_activity_at: Date.now(),
      }),
    );

    renderProvider();

    await waitFor(() => {
      expect(latest).not.toBeNull();
      expect(latest!.vaultUnlocked).toBe(false);
    });
    expect(sessionStorage.getItem(VAULT_UNLOCK_TAB_KEY)).toBeNull();
    expect(storageHasForbiddenSecrets()).toBe(false);

    const vaultKey = crypto.getRandomValues(new Uint8Array(32));
    const shareC = crypto.getRandomValues(new Uint8Array(32));

    await act(async () => {
      latest!.applyUnlockedSecrets(vaultKey, shareC);
    });

    await waitFor(() => {
      expect(latest!.vaultUnlocked).toBe(true);
      expect(latest!.vaultKey).not.toBeNull();
    });
    expect(storageHasForbiddenSecrets()).toBe(false);
    expect(sessionStorage.getItem(VAULT_UNLOCK_TAB_KEY)).toBeNull();

    expect(vaultIdleExceeded(Date.now(), 60_000)).toBe(false);
    expect(storageHasForbiddenSecrets()).toBe(false);

    await act(async () => {
      latest!.lockVault();
    });

    await waitFor(() => {
      expect(latest!.vaultUnlocked).toBe(false);
      expect(latest!.vaultKey).toBeNull();
    });
    expect(storageHasForbiddenSecrets()).toBe(false);
  });

  it("never persists unlock secrets when setItem is observed during unlock", async () => {
    renderProvider();
    await waitFor(() => expect(latest).not.toBeNull());

    const sessionSet = vi.fn(sessionStorage.setItem.bind(sessionStorage));
    const localSet = vi.fn(localStorage.setItem.bind(localStorage));
    sessionStorage.setItem = sessionSet;
    localStorage.setItem = localSet;

    await act(async () => {
      latest!.applyUnlockedSecrets(
        crypto.getRandomValues(new Uint8Array(32)),
        crypto.getRandomValues(new Uint8Array(32)),
      );
    });

    await waitFor(() => expect(latest!.vaultUnlocked).toBe(true));

    for (const call of [...sessionSet.mock.calls, ...localSet.mock.calls]) {
      const key = String(call[0] ?? "");
      const value = String(call[1] ?? "");
      for (const marker of FORBIDDEN) {
        expect(key.includes(marker)).toBe(false);
        expect(value.includes(marker)).toBe(false);
      }
      expect(key).not.toBe(VAULT_UNLOCK_TAB_KEY);
    }
  });

  it("remounting provider (simulating reload) starts locked after unlock", async () => {
    const first = renderProvider();
    await waitFor(() => expect(latest).not.toBeNull());

    await act(async () => {
      latest!.applyUnlockedSecrets(
        crypto.getRandomValues(new Uint8Array(32)),
        crypto.getRandomValues(new Uint8Array(32)),
      );
    });
    await waitFor(() => expect(latest!.vaultUnlocked).toBe(true));

    first.unmount();
    latest = null;

    renderProvider();
    await waitFor(() => {
      expect(latest).not.toBeNull();
      expect(latest!.vaultUnlocked).toBe(false);
      expect(latest!.vaultKey).toBeNull();
    });
    expect(storageHasForbiddenSecrets()).toBe(false);
  });

  it("locks automatically after idle timeout using in-memory activity tracking", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));

    renderProvider();
    expect(latest).not.toBeNull();

    await act(async () => {
      latest!.applyUnlockedSecrets(
        crypto.getRandomValues(new Uint8Array(32)),
        crypto.getRandomValues(new Uint8Array(32)),
      );
    });
    expect(latest!.vaultUnlocked).toBe(true);
    expect(storageHasForbiddenSecrets()).toBe(false);

    // Activity before idle limit keeps the vault unlocked.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_IDLE_MS - 10_000);
    });
    expect(latest!.vaultUnlocked).toBe(true);

    // Passing idle limit triggers the 3s interval watcher and locks in memory.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(latest!.vaultUnlocked).toBe(false);
    expect(latest!.vaultKey).toBeNull();
    expect(storageHasForbiddenSecrets()).toBe(false);
  });

  it("locks on visibilitychange hidden when lockOnDeviceSleep is enabled", async () => {
    patchVaultDevicePrefs("1156820912149601", { lockOnDeviceSleep: true });

    renderProvider();
    await waitFor(() => expect(latest).not.toBeNull());

    await act(async () => {
      latest!.applyUnlockedSecrets(
        crypto.getRandomValues(new Uint8Array(32)),
        crypto.getRandomValues(new Uint8Array(32)),
      );
    });
    await waitFor(() => expect(latest!.vaultUnlocked).toBe(true));

    const prevVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    try {
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
    } finally {
      if (prevVisibility) {
        Object.defineProperty(document, "visibilityState", prevVisibility);
      } else {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "visible",
        });
      }
    }

    await waitFor(() => {
      expect(latest!.vaultUnlocked).toBe(false);
      expect(latest!.vaultKey).toBeNull();
    });
    expect(storageHasForbiddenSecrets()).toBe(false);
  });
});
