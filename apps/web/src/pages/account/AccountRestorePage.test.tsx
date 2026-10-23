import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "../../locale/LocaleContext";
import AccountRestorePage from "./AccountRestorePage";

const changeMasterPassword = vi.hoisted(() => vi.fn(async () => {}));
const rotateAccountRecoveryKey = vi.hoisted(() => vi.fn(async () => {}));
const getAccountRecoveryStatus = vi.hoisted(() => vi.fn());
const getAccountRecoveryKeyWrap = vi.hoisted(() => vi.fn(async () => ({
  encryptedBlob: {
    crypto_version: 2,
    algorithm: "opaque",
    payload: "YQ==",
    meta: { entity: "vault_key_recovery_wrap" },
  },
})));
const unwrapVaultKeyWithRecoverySecret = vi.hoisted(() => vi.fn());

vi.mock("@okkey/crypto", () => ({
  initCrypto: vi.fn(async () => {}),
  unwrapVaultKeyWithRecoverySecret,
  rebalanceServerShareForNewPassword: vi.fn(async () => ({
    serverKeyShare: new Uint8Array([1]),
    passwordKdfSalt: new Uint8Array([2]),
    passwordKdfParamsVersion: 2,
    passwordShareC: new Uint8Array([3]),
  })),
  generateRecoverySecret: vi.fn(async () => "NEWK-EY11"),
  wrapVaultKeyWithRecoverySecret: vi.fn(async () => ({
    crypto_version: 2,
    algorithm: "opaque",
    payload: "YQ==",
    meta: { entity: "vault_key_recovery_wrap" },
  })),
  wipeBytes: vi.fn(),
}));

vi.mock("../../api/client", () => ({
  createAuthenticatedCoreClient: () => ({
    getAccountRecoveryStatus,
    getAccountRecoveryKeyWrap,
    changeMasterPassword,
    rotateAccountRecoveryKey,
    listWorkspaces: async () => [],
    getAccountRecoveryIdentityEncryptedKey: async () => ({
      encrypted_private_key: {
        crypto_version: 2,
        algorithm: "opaque",
        payload: "YQ==",
        meta: {},
      },
    }),
    ackAccountRecoveryKeyExport: async () => {},
  }),
}));

vi.mock("../../auth/AuthVaultContext", () => ({
  useAuthVault: () => ({
    accessToken: "token",
    userId: "user-1",
    vaultUnlocked: false,
    hasVaultBundle: true,
    applyUnlockedSecrets: vi.fn(),
    currentDeviceId: "device-1",
    deviceTrustStatus: "trusted",
    refreshDeviceTrust: vi.fn(),
    markDeviceBlockedForever: vi.fn(),
  }),
}));

vi.mock("../../auth/localVaultBundle", () => ({
  readVaultBundle: () => ({
    server_key_share_b64: "YQ==",
    device_share_b64: "YQ==",
    password_kdf_salt_b64: "YQ==",
    password_kdf_params_version: 2,
    encrypted_private_key: {
      crypto_version: 2,
      algorithm: "opaque",
      payload: "YQ==",
      meta: {},
    },
  }),
  writeVaultBundle: vi.fn(),
}));

function status(input: {
  key?: boolean;
  devices?: boolean;
  contacts?: boolean;
}) {
  return {
    entitlements: {
      recoveryKey: true,
      trustedDevices: Boolean(input.devices),
      trustedContacts: Boolean(input.contacts),
    },
    settings: {
      keyEnabled: Boolean(input.key),
      devicesEnabled: Boolean(input.devices),
      contactsEnabled: Boolean(input.contacts),
    },
    key: {
      enrolled: Boolean(input.key),
      createdAt: input.key ? "2026-01-01T00:00:00.000Z" : null,
      rotatedAt: null,
      exportedAt: null,
    },
    contacts: [],
    confirmedContactCount: 0,
    minConfirmedContacts: 3,
    pendingInvites: [],
    servingAsContact: [],
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <LocaleProvider>
        <AccountRestorePage />
      </LocaleProvider>
    </MemoryRouter>,
  );
}

async function fillPasswords() {
  fireEvent.change(await screen.findByLabelText(/^new master password$/i), {
    target: { value: "new-secret" },
  });
  fireEvent.change(screen.getByLabelText(/^repeat new master password$/i), {
    target: { value: "new-secret" },
  });
}

describe("AccountRestorePage", () => {
  beforeEach(() => {
    changeMasterPassword.mockClear();
    rotateAccountRecoveryKey.mockClear();
    unwrapVaultKeyWithRecoverySecret.mockReset();
    getAccountRecoveryStatus.mockReset();
  });

  it("lists only enabled methods and shows a notice when none are enabled (QA web 3.9)", async () => {
    getAccountRecoveryStatus.mockResolvedValue(status({}));
    const { unmount } = renderPage();
    expect(await screen.findByText(/^no recovery methods enabled$/i)).toBeInTheDocument();
    expect(screen.queryByText(/trusted devices/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/recovery key/i)).not.toBeInTheDocument();
    unmount();

    getAccountRecoveryStatus.mockResolvedValue(status({ key: true }));
    renderPage();
    expect(await screen.findByLabelText(/^recovery key$/i)).toBeInTheDocument();
    expect(screen.queryByText(/^trusted devices$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^trusted contacts$/i)).not.toBeInTheDocument();
  });

  it("shows an error and does not set a new master password for a wrong recovery key (QA web 3.8)", async () => {
    getAccountRecoveryStatus.mockResolvedValue(status({ key: true }));
    unwrapVaultKeyWithRecoverySecret.mockRejectedValue(new Error("unwrap failed"));
    renderPage();
    fireEvent.change(await screen.findByLabelText(/^recovery key$/i), {
      target: { value: "WRONG-KEY" },
    });
    await fillPasswords();
    fireEvent.click(screen.getByRole("button", { name: /restore access/i }));
    expect(await screen.findByText(/could not restore with this recovery key/i)).toBeInTheDocument();
    expect(changeMasterPassword).not.toHaveBeenCalled();
  });

  it("sets a new master password when the recovery key is correct (QA web 3.8)", async () => {
    getAccountRecoveryStatus.mockResolvedValue(status({ key: true }));
    unwrapVaultKeyWithRecoverySecret.mockResolvedValue(new Uint8Array(32));
    renderPage();
    fireEvent.change(await screen.findByLabelText(/^recovery key$/i), {
      target: { value: "RIGHT-KEY" },
    });
    await fillPasswords();
    fireEvent.click(screen.getByRole("button", { name: /restore access/i }));
    await waitFor(() => {
      expect(changeMasterPassword).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText(/save your new recovery key/i)).toBeInTheDocument();
    const payload = changeMasterPassword.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.server_key_share).toBeTypeOf("string");
    expect(JSON.stringify(payload)).not.toContain("new-secret");
  });
});
