import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tryUnlockWithMasterPassword = vi.hoisted(() => vi.fn(async () => false));

vi.mock("../../locale/LocaleContext", () => ({
  useLocale: () => ({
    locale: "en" as const,
    setLocale: () => {},
    t: (key: string) => key,
  }),
}));

vi.mock("../../auth/AuthVaultContext", () => ({
  useAuthVault: () => ({
    accessToken: "token",
    userId: "42",
    profile: { email: "ada@example.com", firstName: "Ada", lastName: "Lovelace" },
    logout: vi.fn(),
    tryUnlockWithMasterPassword,
    ensureVaultBundleForUnlock: vi.fn(async () => true),
    applyUnlockedSecrets: vi.fn(),
    hasVaultBundle: true,
    vaultUnlockBootstrapLoading: false,
    vaultUnlocked: false,
    touchActivity: vi.fn(),
    deviceTrustStatus: "trusted",
  }),
}));

vi.mock("../../auth/vaultDevicePrefs", () => ({
  readVaultDevicePrefs: () => ({
    biometricEnabled: false,
    pinEnabled: false,
  }),
}));

vi.mock("@okkey/crypto", () => ({
  initCrypto: vi.fn(async () => {}),
  unwrapUnlockMaterialWithPin: vi.fn(),
  wipeBytes: vi.fn(),
}));

import UnlockPasswordPage from "./UnlockPasswordPage";

describe("UnlockPasswordPage master password", () => {
  beforeEach(() => {
    tryUnlockWithMasterPassword.mockClear();
    tryUnlockWithMasterPassword.mockResolvedValue(false);
  });

  it.fails("expected failure: repeated wrong master passwords are not limited", async () => {
    render(
      <MemoryRouter>
        <UnlockPasswordPage />
      </MemoryRouter>,
    );
    const password = await screen.findByLabelText("unlock.masterPassword");
    const submit = screen.getByRole("button", { name: "unlock.submit" });
    for (let attempt = 0; attempt < 6; attempt += 1) {
      fireEvent.change(password, { target: { value: "wrong-password" } });
      fireEvent.click(submit);
      await waitFor(() => {
        expect(tryUnlockWithMasterPassword).toHaveBeenCalledTimes(attempt + 1);
      });
    }
    expect(screen.getByText(/attempt|locked|limit/i)).toBeTruthy();
  });
});
