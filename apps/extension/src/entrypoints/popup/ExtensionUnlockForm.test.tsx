/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tryUnlockExtensionWithBiometrics = vi.hoisted(() =>
  vi.fn(async () => ({ ok: false as const, code: "cancelled" as const })),
);

vi.mock("../../lib/extensionBiometricUnlock", () => ({
  tryUnlockExtensionWithBiometrics,
  biometricErrorMessageKey: (code: string) =>
    `web.settingsPopup.vault.biometric.error.${code === "cancelled" ? "cancelled" : code}`,
}));

vi.mock("../../lib/initExtensionCrypto", () => ({
  initExtensionCrypto: vi.fn(async () => {}),
}));

vi.mock("../../lib/extensionDeviceUnlockStore", () => ({
  readExtensionPinUnlockWrap: vi.fn(async () => null),
}));

vi.mock("../../lib/pinRateLimit", () => ({
  clearPinFailures: vi.fn(),
  isPinLocked: () => false,
  recordPinFailure: () => ({ locked: false }),
}));

import { ExtensionUnlockForm } from "./ExtensionUnlockForm";

function t(key: string): string {
  return key;
}

describe("ExtensionUnlockForm biometric lock screen", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    tryUnlockExtensionWithBiometrics.mockReset();
    tryUnlockExtensionWithBiometrics.mockResolvedValue({ ok: false, code: "cancelled" });
  });

  it("does not show biometric option when wrap is missing", async () => {
    render(
      <ExtensionUnlockForm
        userId="user-1"
        identityBar={null}
        biometricEnabled={true}
        hasBioWrap={false}
        pinEnabled={false}
        hasPinWrap={false}
        unlockEpoch={1}
        t={t}
        onUnlocked={vi.fn(async () => true)}
        onMasterPasswordUnlock={vi.fn(async () => {})}
      />,
    );
    expect(screen.queryByText("unlock.biometricPending")).toBeNull();
    expect(screen.queryByText("unlock.useBiometrics")).toBeNull();
    expect(screen.getByLabelText("unlock.masterPassword")).toBeTruthy();
    expect(tryUnlockExtensionWithBiometrics).not.toHaveBeenCalled();
  });

  it("auto-tries biometrics once when enabled and wrap present", async () => {
    tryUnlockExtensionWithBiometrics.mockImplementation(
      () =>
        new Promise(() => {
          /* keep pending */
        }),
    );
    render(
      <ExtensionUnlockForm
        userId="user-1"
        identityBar={null}
        biometricEnabled={true}
        hasBioWrap={true}
        pinEnabled={true}
        hasPinWrap={true}
        unlockEpoch={1}
        t={t}
        onUnlocked={vi.fn(async () => true)}
        onMasterPasswordUnlock={vi.fn(async () => {})}
      />,
    );
    expect(await screen.findByText("unlock.biometricPending")).toBeTruthy();
    await waitFor(() => {
      expect(tryUnlockExtensionWithBiometrics).toHaveBeenCalledTimes(1);
    });
  });

  it("unlocks on biometric success", async () => {
    const vaultKey = new Uint8Array([1, 2, 3]);
    const passwordShareC = new Uint8Array([4, 5, 6]);
    tryUnlockExtensionWithBiometrics.mockResolvedValue({
      ok: true,
      vaultKey,
      passwordShareC,
    });
    const onUnlocked = vi.fn(async () => true);
    render(
      <ExtensionUnlockForm
        userId="user-1"
        identityBar={null}
        biometricEnabled={true}
        hasBioWrap={true}
        pinEnabled={false}
        hasPinWrap={false}
        unlockEpoch={1}
        t={t}
        onUnlocked={onUnlocked}
        onMasterPasswordUnlock={vi.fn(async () => {})}
      />,
    );
    await waitFor(() => {
      expect(onUnlocked).toHaveBeenCalledTimes(1);
    });
    expect(onUnlocked.mock.calls[0]?.[0]).toEqual({ vaultKey, passwordShareC });
  });

  it("stays locked on cancel and keeps PIN/master available", async () => {
    tryUnlockExtensionWithBiometrics.mockResolvedValue({ ok: false, code: "cancelled" });
    const onUnlocked = vi.fn(async () => true);
    render(
      <ExtensionUnlockForm
        userId="user-1"
        identityBar={null}
        biometricEnabled={true}
        hasBioWrap={true}
        pinEnabled={true}
        hasPinWrap={true}
        unlockEpoch={1}
        t={t}
        onUnlocked={onUnlocked}
        onMasterPasswordUnlock={vi.fn(async () => {})}
      />,
    );
    expect(await screen.findByText("web.settingsPopup.vault.biometric.error.cancelled")).toBeTruthy();
    expect(onUnlocked).not.toHaveBeenCalled();
    expect(screen.getByText("unlock.pin")).toBeTruthy();
    expect(screen.getByText("unlock.useBiometrics")).toBeTruthy();
    expect(screen.getByText("unlock.useMasterPassword")).toBeTruthy();
    expect(tryUnlockExtensionWithBiometrics).toHaveBeenCalledTimes(1);
  });

  it("does not call WebAuthn twice for one unlock visit", async () => {
    let resolveUnlock: ((value: { ok: false; code: "cancelled" }) => void) | null = null;
    tryUnlockExtensionWithBiometrics.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUnlock = resolve;
        }),
    );
    const { rerender } = render(
      <ExtensionUnlockForm
        userId="user-1"
        identityBar={null}
        biometricEnabled={true}
        hasBioWrap={true}
        pinEnabled={false}
        hasPinWrap={false}
        unlockEpoch={1}
        t={t}
        onUnlocked={vi.fn(async () => true)}
        onMasterPasswordUnlock={vi.fn(async () => {})}
      />,
    );
    await waitFor(() => {
      expect(tryUnlockExtensionWithBiometrics).toHaveBeenCalledTimes(1);
    });
    // Re-render with a new translator identity (common parent churn) while in flight.
    rerender(
      <ExtensionUnlockForm
        userId="user-1"
        identityBar={null}
        biometricEnabled={true}
        hasBioWrap={true}
        pinEnabled={false}
        hasPinWrap={false}
        unlockEpoch={1}
        t={(key) => key}
        onUnlocked={vi.fn(async () => true)}
        onMasterPasswordUnlock={vi.fn(async () => {})}
      />,
    );
    resolveUnlock?.({ ok: false, code: "cancelled" });
    await waitFor(() => {
      expect(screen.getByLabelText("unlock.masterPassword")).toBeTruthy();
    });
    expect(tryUnlockExtensionWithBiometrics).toHaveBeenCalledTimes(1);
  });

  it("manual retry after cancel issues a fresh WebAuthn call", async () => {
    tryUnlockExtensionWithBiometrics.mockResolvedValue({ ok: false, code: "cancelled" });
    render(
      <ExtensionUnlockForm
        userId="user-1"
        identityBar={null}
        biometricEnabled={true}
        hasBioWrap={true}
        pinEnabled={false}
        hasPinWrap={false}
        unlockEpoch={1}
        t={t}
        onUnlocked={vi.fn(async () => true)}
        onMasterPasswordUnlock={vi.fn(async () => {})}
      />,
    );
    expect(await screen.findByText("unlock.useBiometrics")).toBeTruthy();
    expect(tryUnlockExtensionWithBiometrics).toHaveBeenCalledTimes(1);
    tryUnlockExtensionWithBiometrics.mockImplementation(
      () =>
        new Promise(() => {
          /* pending */
        }),
    );
    fireEvent.click(screen.getByText("unlock.useBiometrics"));
    expect(await screen.findByText("unlock.biometricPending")).toBeTruthy();
    await waitFor(() => {
      expect(tryUnlockExtensionWithBiometrics).toHaveBeenCalledTimes(2);
    });
  });
});
