import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAccountRecoveryStatus: vi.fn(),
  enrollAccountRecoveryKey: vi.fn(),
  ackAccountRecoveryKeyExport: vi.fn(),
  vaultUnlocked: true,
  accessToken: "token" as string | null,
  deviceTrustStatus: "trusted",
  vaultUnlockBootstrapLoading: false,
}));

vi.mock("../api/client", () => ({
  createAuthenticatedCoreClient: () => ({
    getAccountRecoveryStatus: mocks.getAccountRecoveryStatus,
    enrollAccountRecoveryKey: mocks.enrollAccountRecoveryKey,
    ackAccountRecoveryKeyExport: mocks.ackAccountRecoveryKeyExport,
  }),
}));

vi.mock("./AuthVaultContext", () => ({
  useAuthVault: () => ({
    accessToken: mocks.accessToken,
    vaultUnlocked: mocks.vaultUnlocked,
    vaultUnlockBootstrapLoading: mocks.vaultUnlockBootstrapLoading,
    deviceTrustStatus: mocks.deviceTrustStatus,
    vaultKey: new Uint8Array(32),
  }),
}));

vi.mock("../locale/LocaleContext", () => ({
  useLocale: () => ({ locale: "en", setLocale: () => undefined, t: (key: string) => key }),
}));

vi.mock("@okkey/crypto", () => ({
  initCrypto: vi.fn(async () => undefined),
  generateRecoverySecret: vi.fn(async () => "RECOVERY-SECRET"),
  wrapVaultKeyWithRecoverySecret: vi.fn(async () => ({
    crypto_version: 2,
    algorithm: "xchacha20-poly1305",
    payload: "abc",
    meta: { entity: "vault_key_recovery_wrap" },
  })),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

import ProtectedVaultLayout from "./ProtectedVaultLayout";

function renderVault() {
  return render(
    <MemoryRouter initialEntries={["/items"]}>
      <Routes>
        <Route element={<ProtectedVaultLayout />}>
          <Route path="/items" element={<div>vault items</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedVaultLayout recovery key step", () => {
  beforeEach(() => {
    mocks.vaultUnlocked = true;
    mocks.accessToken = "token";
    mocks.deviceTrustStatus = "trusted";
    mocks.vaultUnlockBootstrapLoading = false;
    mocks.getAccountRecoveryStatus.mockReset();
    mocks.enrollAccountRecoveryKey.mockReset();
    mocks.ackAccountRecoveryKeyExport.mockReset();
    mocks.enrollAccountRecoveryKey.mockResolvedValue({ key: { enrolled: true } });
    mocks.ackAccountRecoveryKeyExport.mockResolvedValue({});
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(async () => undefined) },
    });
  });

  it("shows vault items when a recovery key is saved and exported", async () => {
    mocks.getAccountRecoveryStatus.mockResolvedValue({
      key: { enrolled: true, exportedAt: "2026-01-01T00:00:00.000Z" },
    });
    renderVault();
    expect(await screen.findByText("vault items")).toBeInTheDocument();
    expect(screen.queryByTestId("recovery-key-required")).not.toBeInTheDocument();
  });

  it("keeps the vault hidden when enrolled without export and requires save again", async () => {
    mocks.getAccountRecoveryStatus.mockResolvedValue({
      key: { enrolled: true, exportedAt: null },
    });
    renderVault();

    expect(await screen.findByText("RECOVERY-SECRET")).toBeInTheDocument();
    expect(screen.queryByText("vault items")).not.toBeInTheDocument();
    expect(mocks.enrollAccountRecoveryKey).toHaveBeenCalledOnce();

    const continueButton = screen.getByRole("button", { name: "auth.registration.recovery.next" });
    expect(continueButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "auth.registration.recovery.copy" }));
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);

    expect(await screen.findByText("vault items")).toBeInTheDocument();
    expect(mocks.ackAccountRecoveryKeyExport).toHaveBeenCalledOnce();
  });

  it("keeps the vault hidden until a recovery key is created and saved", async () => {
    mocks.getAccountRecoveryStatus.mockResolvedValue({
      key: { enrolled: false, exportedAt: null },
    });
    renderVault();

    const create = await screen.findByRole("button", { name: "auth.recovery.required.create" });
    expect(screen.queryByText("vault items")).not.toBeInTheDocument();

    fireEvent.click(create);
    expect(await screen.findByText("RECOVERY-SECRET")).toBeInTheDocument();
    expect(screen.queryByText("vault items")).not.toBeInTheDocument();

    const continueButton = screen.getByRole("button", { name: "auth.registration.recovery.next" });
    expect(continueButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "auth.registration.recovery.copy" }));
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);

    expect(await screen.findByText("vault items")).toBeInTheDocument();
    expect(mocks.enrollAccountRecoveryKey).toHaveBeenCalledOnce();
    expect(mocks.ackAccountRecoveryKeyExport).toHaveBeenCalledOnce();
  });
});
