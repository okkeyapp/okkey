import { afterEach, describe, expect, it, vi } from "vitest";
import { VAULT_UNLOCK_TAB_KEY } from "./storageKeys";
import {
  clearVaultUnlockSession,
  persistVaultUnlockSession,
  readInitialTabVaultSession,
  readVaultUnlockSessionIfFresh,
  touchVaultUnlockSession,
} from "./vaultUnlockSessionStorage";

const userId = "00000000-0000-4000-8000-000000000001";
const vaultKey = new Uint8Array(32).fill(7);

describe("vaultUnlockSessionStorage", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it("persists and restores within idle window", () => {
    persistVaultUnlockSession(userId, vaultKey);
    const got = readVaultUnlockSessionIfFresh(userId, 60_000);
    expect(got).not.toBeNull();
    expect(got!.vaultKey.length).toBe(32);
    expect(got!.vaultKey[0]).toBe(7);
  });

  it("returns null for wrong user", () => {
    persistVaultUnlockSession(userId, vaultKey);
    expect(readVaultUnlockSessionIfFresh("other-user-uuid-here-000000000001", 60_000)).toBeNull();
  });

  it("expires when last activity is older than idleMs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    persistVaultUnlockSession(userId, vaultKey);
    vi.setSystemTime(new Date("2026-01-01T12:16:00Z"));
    expect(readVaultUnlockSessionIfFresh(userId, 15 * 60 * 1000)).toBeNull();
    expect(sessionStorage.getItem(VAULT_UNLOCK_TAB_KEY)).toBeNull();
  });

  it("touchVaultUnlockSession refreshes last activity", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    persistVaultUnlockSession(userId, vaultKey);
    vi.setSystemTime(new Date("2026-01-01T12:14:00Z"));
    touchVaultUnlockSession(userId);
    vi.setSystemTime(new Date("2026-01-01T12:20:00Z"));
    const got = readVaultUnlockSessionIfFresh(userId, 15 * 60 * 1000);
    expect(got).not.toBeNull();
  });

  it("clearVaultUnlockSession removes record", () => {
    persistVaultUnlockSession(userId, vaultKey);
    clearVaultUnlockSession();
    expect(readVaultUnlockSessionIfFresh(userId, 60_000)).toBeNull();
  });

  it("readInitialTabVaultSession matches fresh read with default idle", () => {
    persistVaultUnlockSession(userId, vaultKey);
    const init = readInitialTabVaultSession(userId);
    expect(init.unlocked).toBe(true);
    expect(init.vaultKey).not.toBeNull();
    expect(init.vaultKey!.length).toBe(32);
  });
});
