import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  navigate,
  enrollAccountRecoveryKey,
  ackAccountRecoveryKeyExport,
  completeRegistration,
  beginRegistration,
  skipMail,
  updateInstance,
  verifyCode,
  getStatus,
  getMailSettings,
  listSmtpProviders,
  getInstance,
} = vi.hoisted(() => ({
  navigate: vi.fn(),
  enrollAccountRecoveryKey: vi.fn(),
  ackAccountRecoveryKeyExport: vi.fn(),
  completeRegistration: vi.fn(),
  beginRegistration: vi.fn(),
  skipMail: vi.fn(),
  updateInstance: vi.fn(),
  verifyCode: vi.fn(),
  getStatus: vi.fn(),
  getMailSettings: vi.fn(),
  listSmtpProviders: vi.fn(),
  getInstance: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigate,
  };
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
    authClient: {
      completeRegistration,
    },
    applyAccessTokenResponse: vi.fn(),
    tryUnlockWithMasterPassword: vi.fn(async () => ({ ok: true })),
    updateLocalProfile: vi.fn(),
    setRegistrationAuthStateId: vi.fn(),
    clearEmailLoginFlow: vi.fn(),
    saveVaultBundle: vi.fn(),
  }),
}));

vi.mock("../../setup/setupApi", () => ({
  createSetupApiClient: () => ({
    getStatus,
    verifyCode,
    getMailSettings,
    listSmtpProviders,
    getInstance,
    skipMail,
    updateInstance,
    beginRegistration,
    updateMailSettings: vi.fn(),
    sendTestEmail: vi.fn(),
    finish: vi.fn(),
  }),
}));

vi.mock("@okkey/crypto", () => ({
  initCrypto: vi.fn(async () => {}),
  buildRegistrationCryptoArtifacts: vi.fn(async () => ({
    vaultKey: new Uint8Array(32).fill(7),
    deviceShare: new Uint8Array(32),
    wrappedDeviceShare: new Uint8Array([9, 9, 9, 9]),
    shareWrap: {
      ed25519Seed: new Uint8Array(32),
      ed25519PublicKey: new Uint8Array(32),
      mlkemDecapsulationKey: new Uint8Array(8),
      mlkemEncapsulationKey: new Uint8Array(8),
    },
    serverKeyShare: new Uint8Array(32),
  })),
  registrationArtifactsToWire: vi.fn(() => ({
    user_public_key: "pk",
    user_public_pq_key: "pq",
    user_public_mldsa_key: "mldsa",
    encrypted_private_key: {
      crypto_version: 2,
      algorithm: "opaque",
      payload: "aa",
      meta: {},
    },
    server_key_share: "c2hhcmU=",
    password_kdf_salt: "c2FsdA==",
    password_kdf_params_version: 2,
  })),
  generateRecoverySecret: vi.fn(async () => "ABCD-EFGH-IJKM"),
  recoveryPossessionPublicKey: vi.fn(async () => "cG9zc2Vzc2lvbi1wdWJsaWMta2V5LWJhc2U2NA=="),
  wrapVaultKeyWithRecoverySecret: vi.fn(async () => ({
    crypto_version: 2,
    algorithm: "xchacha20poly1305",
    payload: "blob",
    meta: {},
  })),
  wipeBytes: vi.fn(),
  deriveLoginKey: vi.fn(async () => new Uint8Array(32)),
}));

vi.mock("../../api/client", () => ({
  createAuthenticatedCoreClient: () => ({
    enrollAccountRecoveryKey,
    ackAccountRecoveryKeyExport,
  }),
}));

vi.mock("../../auth/localVaultBundle", () => ({
  finalizePendingVaultBundle: vi.fn(),
}));

vi.mock("../../auth/deviceSigningKey", () => ({
  ensureDeviceSigningPublicKey: vi.fn(async () => btoa("pub-key-32-bytes-pad!!!!!!")),
}));

vi.mock("../../auth/deviceFingerprint", () => ({
  getOrCreateDeviceFingerprint: () => "fp-test",
}));

vi.mock("@okkey/vault", () => ({
  persistSplitKeyShareWrapKey: vi.fn(async () => undefined),
  clearSplitKeyShareWrapKey: vi.fn(async () => undefined),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => "toast"),
    dismiss: vi.fn(),
  },
}));

import SetupWizardPage from "./SetupWizardPage";

const emptyMail = {
  smtp_host: "",
  smtp_port: null,
  smtp_tls_mode: "starttls" as const,
  smtp_username: "",
  email_from: "",
  public_app_url: "",
  password_set: false,
  smtp_active: false,
};

async function advanceToPasswordStep() {
  await screen.findByTestId("setup-code-input");
  // SetupCodeInput treats multi-char change on the first cell as a paste.
  const firstDigit = document.getElementById("setup-code");
  expect(firstDigit).toBeTruthy();
  fireEvent.change(firstDigit!, { target: { value: "aaaabbbbccccdddd" } });

  const submitCode = await screen.findByRole("button", { name: "auth.setup.submitCode" });
  await waitFor(() => {
    expect(submitCode).toBeEnabled();
  });
  fireEvent.click(submitCode);

  const skip = await screen.findByRole("button", { name: "web.setupWizard.mailSkip" });
  fireEvent.click(skip);

  const serverContinue = await screen.findByRole("button", { name: "web.setupWizard.ownerNext" });
  fireEvent.click(serverContinue);

  const email = await screen.findByLabelText("web.setupWizard.ownerEmail");
  fireEvent.change(email, { target: { value: "owner@example.com" } });
  fireEvent.change(screen.getByLabelText("web.setupWizard.workspaceName"), {
    target: { value: "Acme" },
  });
  fireEvent.click(screen.getByRole("button", { name: "web.setupWizard.ownerNext" }));

  await screen.findByLabelText("auth.registration.masterPassword");
}

async function submitMasterPassword() {
  fireEvent.change(screen.getByLabelText("auth.registration.masterPassword"), {
    target: { value: "correct horse" },
  });
  fireEvent.change(screen.getByLabelText("auth.registration.repeatMasterPassword"), {
    target: { value: "correct horse" },
  });
  fireEvent.click(screen.getByRole("button", { name: "auth.registration.submit" }));
}

describe("SetupWizardPage device registration retry", () => {
  beforeEach(() => {
    navigate.mockReset();
    enrollAccountRecoveryKey.mockReset();
    ackAccountRecoveryKeyExport.mockReset();
    completeRegistration.mockReset();
    beginRegistration.mockReset();
    skipMail.mockReset();
    updateInstance.mockReset();
    verifyCode.mockReset();
    getStatus.mockReset();
    getMailSettings.mockReset();
    listSmtpProviders.mockReset();
    getInstance.mockReset();

    getStatus.mockResolvedValue({ required: true, deployment_mode: "self_hosted" });
    verifyCode.mockResolvedValue({
      setup_token: "setup-token",
      expires_at: "2099-01-01T00:00:00.000Z",
    });
    getMailSettings.mockResolvedValue(emptyMail);
    listSmtpProviders.mockResolvedValue({
      providers: [{ id: "custom", smtp_host: "", smtp_port: 587, smtp_tls_mode: "starttls", username_hint: null, default_username: null }],
    });
    getInstance.mockResolvedValue({ public_app_url: "https://vault.example.com", registration_mode: "open" });
    skipMail.mockResolvedValue(emptyMail);
    updateInstance.mockResolvedValue({
      public_app_url: "https://vault.example.com",
      registration_mode: "open",
    });
    beginRegistration.mockResolvedValue({
      auth_state_id: "auth-state",
      email: "owner@example.com",
      expires_at: "2099-01-01T00:00:00.000Z",
    });
    completeRegistration.mockResolvedValue({
      access_token: "bootstrap-token",
      expires_at: "2099-01-01T00:00:00.000Z",
      user_id: "u1",
      token_type: "Bearer",
    });
  });

  it("shows a clear error and Try again when device registration follow-up fails", async () => {
    enrollAccountRecoveryKey.mockRejectedValue(new Error("enroll failed"));
    render(
      <MemoryRouter>
        <SetupWizardPage />
      </MemoryRouter>,
    );
    await advanceToPasswordStep();
    await submitMasterPassword();

    expect(await screen.findByTestId("setup-device-registration-failed")).toBeTruthy();
    expect(screen.getAllByText("web.setupWizard.deviceRegistration.error").length).toBeGreaterThan(0);
    const retry = screen.getByRole("button", { name: "web.setupWizard.deviceRegistration.retry" });
    expect(retry).toBeEnabled();
    expect(enrollAccountRecoveryKey).toHaveBeenCalledTimes(1);
  });

  it("re-runs the failed step on Try again and continues to recovery export on success", async () => {
    enrollAccountRecoveryKey
      .mockRejectedValueOnce(new Error("enroll failed"))
      .mockResolvedValueOnce({});
    render(
      <MemoryRouter>
        <SetupWizardPage />
      </MemoryRouter>,
    );
    await advanceToPasswordStep();
    await submitMasterPassword();

    const retry = await screen.findByRole("button", { name: "web.setupWizard.deviceRegistration.retry" });
    fireEvent.click(retry);

    await waitFor(() => {
      expect(enrollAccountRecoveryKey).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("ABCD-EFGH-IJKM")).toBeTruthy();
    expect(screen.getByRole("button", { name: "web.setupWizard.finish" })).toBeDisabled();
    // Previous wizard data stays in memory; device registration is not repeated.
    expect(completeRegistration).toHaveBeenCalledTimes(1);
  });

  it("keeps Try again available after a repeated failure without a stuck busy state", async () => {
    enrollAccountRecoveryKey.mockRejectedValue(new Error("enroll failed"));
    render(
      <MemoryRouter>
        <SetupWizardPage />
      </MemoryRouter>,
    );
    await advanceToPasswordStep();
    await submitMasterPassword();

    const retry = await screen.findByRole("button", { name: "web.setupWizard.deviceRegistration.retry" });
    fireEvent.click(retry);

    await waitFor(() => {
      expect(enrollAccountRecoveryKey).toHaveBeenCalledTimes(2);
    });
    const retryAgain = await screen.findByRole("button", { name: "web.setupWizard.deviceRegistration.retry" });
    expect(retryAgain).toBeEnabled();
    expect(screen.getByTestId("setup-device-registration-failed")).toBeTruthy();
    expect(screen.queryByRole("status", { busy: true })).toBeNull();
  });

  it("re-runs device registration with a fresh auth state when completeRegistration fails", async () => {
    completeRegistration
      .mockRejectedValueOnce(new Error("register failed"))
      .mockResolvedValueOnce({
        access_token: "bootstrap-token",
        expires_at: "2099-01-01T00:00:00.000Z",
        user_id: "u1",
        token_type: "Bearer",
      });
    enrollAccountRecoveryKey.mockResolvedValue({});
    beginRegistration
      .mockResolvedValueOnce({
        auth_state_id: "auth-state",
        email: "owner@example.com",
        expires_at: "2099-01-01T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        auth_state_id: "auth-state-retry",
        email: "owner@example.com",
        expires_at: "2099-01-01T00:00:00.000Z",
      });

    render(
      <MemoryRouter>
        <SetupWizardPage />
      </MemoryRouter>,
    );
    await advanceToPasswordStep();
    await submitMasterPassword();

    expect(await screen.findByTestId("setup-device-registration-failed")).toBeTruthy();
    expect(completeRegistration).toHaveBeenCalledTimes(1);
    expect(completeRegistration.mock.calls[0]?.[0]?.auth_state_id).toBe("auth-state");
    expect(completeRegistration.mock.calls[0]?.[0]?.locale).toBe("en");

    fireEvent.click(screen.getByRole("button", { name: "web.setupWizard.deviceRegistration.retry" }));

    await waitFor(() => {
      expect(completeRegistration).toHaveBeenCalledTimes(2);
    });
    expect(beginRegistration).toHaveBeenCalledTimes(2);
    expect(completeRegistration.mock.calls[1]?.[0]?.auth_state_id).toBe("auth-state-retry");
    expect(completeRegistration.mock.calls[1]?.[0]?.locale).toBe("en");
    expect(await screen.findByText("ABCD-EFGH-IJKM")).toBeTruthy();
  });
});
