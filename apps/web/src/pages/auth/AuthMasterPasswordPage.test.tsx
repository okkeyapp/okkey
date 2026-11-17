import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loginWithMasterPassword, completeLoginAfterEmailConfirm, navigate } = vi.hoisted(() => ({
  loginWithMasterPassword: vi.fn(),
  completeLoginAfterEmailConfirm: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

vi.mock("../../locale/LocaleContext", () => ({
  useLocale: () => ({
    locale: "en" as const,
    setLocale: () => {},
    t: (key: string) => key,
  }),
}));

vi.mock("../../auth/AuthVaultContext", () => ({
  useAuthVault: () => ({
    authClient: { loginWithMasterPassword, completeLoginAfterEmailConfirm },
    pendingEmail: "ada@example.com",
    emailChallengeId: "challenge-1",
    setTwoFactorAuthStateId: vi.fn(),
    applyAccessTokenResponse: vi.fn(),
  }),
}));

vi.mock("@okkey/crypto", () => ({
  initCrypto: vi.fn(async () => {}),
  deriveLoginKey: vi.fn(async () => new Uint8Array([9, 8, 7, 6])),
  wipeBytes: vi.fn(),
}));

import AuthMasterPasswordPage from "./AuthMasterPasswordPage";

describe("AuthMasterPasswordPage", () => {
  beforeEach(() => {
    loginWithMasterPassword.mockReset();
    completeLoginAfterEmailConfirm.mockReset();
    navigate.mockReset();
    loginWithMasterPassword.mockResolvedValue({
      authStateId: "state-1",
      userExists: true,
      nextStep: "device_check",
    });
    completeLoginAfterEmailConfirm.mockResolvedValue({
      access_token: "token-1",
      expires_at: "2099-01-01T00:00:00.000Z",
      user_id: "user-1",
      token_type: "Bearer",
    });
  });

  it("sends the login key and never the master password", async () => {
    const masterPassword = "correct horse battery";
    render(
      <MemoryRouter>
        <AuthMasterPasswordPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("auth.masterPassword.label"), {
      target: { value: masterPassword },
    });
    fireEvent.click(screen.getByRole("button", { name: "auth.masterPassword.submit" }));

    await screen.findByText("auth.masterPassword.totpOfferTitle");
    expect(loginWithMasterPassword).toHaveBeenCalledTimes(1);
    const body = loginWithMasterPassword.mock.calls[0]?.[0] as { email: string; loginKey: string };
    expect(Object.keys(body).sort()).toEqual(["email", "loginKey"]);
    expect(body.email).toBe("ada@example.com");
    expect(body.loginKey.length).toBeGreaterThan(0);
    expect(JSON.stringify(body).includes(masterPassword)).toBe(false);
    expect(completeLoginAfterEmailConfirm).toHaveBeenCalledWith("state-1", "device_check");
  });
});
