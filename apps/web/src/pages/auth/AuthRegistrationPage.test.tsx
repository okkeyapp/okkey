import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigate, enrollAccountRecoveryKey, ackAccountRecoveryKeyExport, downloadRecoveryKeyPdf } =
  vi.hoisted(() => ({
    navigate: vi.fn(),
    enrollAccountRecoveryKey: vi.fn(),
    ackAccountRecoveryKeyExport: vi.fn(),
    downloadRecoveryKeyPdf: vi.fn(),
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
      completeRegistration: vi.fn(async () => ({
        access_token: "access-token",
        expires_at: "2026-01-01T00:00:00.000Z",
        user_id: "42",
        token_type: "Bearer",
      })),
    },
    registrationAuthStateId: "auth-state",
    profile: { email: "new@example.com" },
    saveVaultBundle: vi.fn(),
    updateLocalProfile: vi.fn(),
    setRegistrationAuthStateId: vi.fn(),
    clearEmailLoginFlow: vi.fn(),
    logout: vi.fn(),
    accessToken: null,
  }),
}));

vi.mock("@okkey/crypto", () => ({
  initCrypto: vi.fn(async () => {}),
  buildRegistrationCryptoArtifacts: vi.fn(async () => ({
    vaultKey: new Uint8Array(32),
    deviceShare: new Uint8Array(32),
    serverKeyShare: new Uint8Array(32),
  })),
  registrationArtifactsToWire: vi.fn(() => ({
    user_public_key: "pk",
    user_public_pq_key: "pq",
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
  ed25519Keypair: vi.fn(() => new Uint8Array(64)),
  generateRecoverySecret: vi.fn(async () => "ABCD-EFGH-IJKM"),
  wrapVaultKeyWithRecoverySecret: vi.fn(async () => ({
    crypto_version: 2,
    algorithm: "xchacha20poly1305",
    payload: "blob",
    meta: {},
  })),
  wipeBytes: vi.fn(),
}));

vi.mock("../../api/client", () => ({
  createAuthenticatedCoreClient: () => ({
    enrollAccountRecoveryKey,
    ackAccountRecoveryKeyExport,
  }),
}));

vi.mock("../../auth/completeExtensionAuthHandoff", () => ({
  completeExtensionAuthHandoffIfPending: vi.fn(async () => false),
}));

vi.mock("../../components/settings/recoveryKeyPdf", () => ({
  downloadRecoveryKeyPdf,
}));

vi.mock("../../auth/localVaultBundle", () => ({
  finalizePendingVaultBundle: vi.fn(),
}));

vi.mock("./registrationErrors", () => ({
  registrationErrorI18nKey: () => "auth.registration.errorGeneric",
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => "toast"),
    dismiss: vi.fn(),
  },
}));

import AuthRegistrationPage from "./AuthRegistrationPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthRegistrationPage />
    </MemoryRouter>,
  );
}

async function submitRegistration() {
  fireEvent.change(screen.getByLabelText("auth.registration.firstName"), {
    target: { value: "Ada" },
  });
  fireEvent.change(screen.getByLabelText("auth.registration.lastName"), {
    target: { value: "Lovelace" },
  });
  fireEvent.change(screen.getByLabelText("auth.registration.masterPassword"), {
    target: { value: "correct horse" },
  });
  fireEvent.change(screen.getByLabelText("auth.registration.repeatMasterPassword"), {
    target: { value: "correct horse" },
  });
  fireEvent.click(screen.getByRole("button", { name: "auth.registration.submit" }));
}

describe("AuthRegistrationPage recovery key", () => {
  beforeEach(() => {
    navigate.mockReset();
    enrollAccountRecoveryKey.mockReset();
    ackAccountRecoveryKeyExport.mockReset();
    downloadRecoveryKeyPdf.mockReset();
    ackAccountRecoveryKeyExport.mockResolvedValue({});
    downloadRecoveryKeyPdf.mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(async () => {}),
      },
    });
  });

  it("keeps Continue disabled until the key is copied or the PDF is downloaded", async () => {
    enrollAccountRecoveryKey.mockResolvedValue({});
    renderPage();
    await submitRegistration();

    const next = await screen.findByRole("button", { name: "auth.registration.recovery.next" });
    expect(next).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "auth.registration.recovery.copy" }));
    await waitFor(() => {
      expect(next).toBeEnabled();
    });
  });

  it("keeps Continue disabled until export ack resolves after copy", async () => {
    enrollAccountRecoveryKey.mockResolvedValue({});
    let resolveAck: ((value: unknown) => void) | undefined;
    ackAccountRecoveryKeyExport.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAck = resolve;
        }),
    );
    renderPage();
    await submitRegistration();

    const next = await screen.findByRole("button", { name: "auth.registration.recovery.next" });
    fireEvent.click(screen.getByRole("button", { name: "auth.registration.recovery.copy" }));
    await waitFor(() => {
      expect(ackAccountRecoveryKeyExport).toHaveBeenCalled();
    });
    expect(next).toBeDisabled();

    resolveAck?.({});
    await waitFor(() => {
      expect(next).toBeEnabled();
    });
  });

  it("enables Continue after the recovery PDF is downloaded", async () => {
    enrollAccountRecoveryKey.mockResolvedValue({});
    renderPage();
    await submitRegistration();
    const next = await screen.findByRole("button", { name: "auth.registration.recovery.next" });
    expect(next).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "auth.registration.recovery.downloadPdf" }));
    await waitFor(() => {
      expect(next).toBeEnabled();
    });
  });
});
