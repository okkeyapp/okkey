import { ApiRequestError } from "@okkey/api";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LOCALE_STORAGE_KEY } from "../../locale/localeStorage";
import { LocaleProvider } from "../../locale/LocaleContext";
import AccountRestorePage from "./AccountRestorePage";

const order: string[] = [];

const core = vi.hoisted(() => ({
  getAccountRecoveryStatus: vi.fn(),
  changeMasterPassword: vi.fn(),
  getAccountRecoveryIdentityEncryptedKey: vi.fn(),
  listWorkspaces: vi.fn(),
  rotateAccountRecoveryKey: vi.fn(),
  proveAccountRecoveryKey: vi.fn(),
  getAccountRecoveryKeyWrap: vi.fn(),
  post: vi.fn(),
}));

const cryptoMocks = vi.hoisted(() => ({
  openStoredSplitKeyShareB: vi.fn(),
  sealSplitKeyShareB: vi.fn(async () => ({
    wrapped: new Uint8Array([1, 2, 3]),
    shareWrap: {
      ed25519Seed: new Uint8Array(32),
      mlkemDecapsulationKey: new Uint8Array(32),
    },
  })),
  rebalanceServerShareForNewPassword: vi.fn(async () => ({
    serverKeyShare: new Uint8Array(32),
    passwordKdfSalt: new Uint8Array(16),
    passwordKdfParamsVersion: 2,
    passwordShareC: new Uint8Array(32),
  })),
}));

vi.mock("@okkey/crypto", () => ({
  initCrypto: vi.fn(async () => undefined),
  generateRecoverySecret: vi.fn(async () => "AAAA-BBBB-CCCC-DDDD"),
  recoveryPossessionPublicKey: vi.fn(async () => "cG9zc2Vzc2lvbi1wdWJsaWMta2V5"),
  wrapVaultKeyWithRecoverySecret: vi.fn(async () => ({
    crypto_version: 2,
    algorithm: "xchacha20-poly1305",
    payload: "abc",
    meta: { entity: "vault_key_recovery_wrap", key_scope: "account" },
  })),
  unwrapVaultKeyWithRecoverySecret: vi.fn(async () => new Uint8Array(32)),
  signRecoveryPossessionProof: vi.fn(async () => "c2ln"),
  sealSplitKeyShareB: (...args: unknown[]) => cryptoMocks.sealSplitKeyShareB(...args),
  openStoredSplitKeyShareB: (...args: unknown[]) => cryptoMocks.openStoredSplitKeyShareB(...args),
  rebalanceServerShareForNewPassword: (...args: unknown[]) =>
    cryptoMocks.rebalanceServerShareForNewPassword(...args),
  wipeBytes: vi.fn(),
}));

vi.mock("@okkey/vault", () => ({
  createWorkspaceFoldersSyncController: vi.fn(),
  loadSplitKeyShareWrapKey: vi.fn(async () => null),
  persistSplitKeyShareWrapKey: vi.fn(async () => undefined),
  rememberServerKeyShare: vi.fn(),
}));

const vaultBundleMocks = vi.hoisted(() => ({
  readVaultBundle: vi.fn(() => null as null | {
    device_share_b64: string;
    password_kdf_salt_b64: string;
    password_kdf_params_version: number;
    encrypted_private_key: {
      crypto_version: number;
      algorithm: string;
      payload: string;
      meta: Record<string, unknown>;
    };
  }),
  writeVaultBundle: vi.fn(),
}));

vi.mock("../../auth/localVaultBundle", () => ({
  readVaultBundle: (...args: unknown[]) => vaultBundleMocks.readVaultBundle(...args),
  writeVaultBundle: (...args: unknown[]) => vaultBundleMocks.writeVaultBundle(...args),
}));

const registerCurrentBrowserDevice = vi.hoisted(() => vi.fn());

vi.mock("../../auth/deviceTrust", () => ({
  registerCurrentBrowserDevice: (...args: unknown[]) => registerCurrentBrowserDevice(...args),
}));

vi.mock("../../api/client", () => ({
  createAuthenticatedCoreClient: () => ({
    ...core,
    getHttpClient: () => ({ post: core.post }),
  }),
}));

const authVaultState = vi.hoisted(() => ({
  deviceTrustStatus: "pending" as "pending" | "trusted" | "blocked" | "rejected" | "checking" | "error",
  hasVaultBundle: false,
}));

vi.mock("../../auth/AuthVaultContext", () => ({
  useAuthVault: () => ({
    accessToken: "token",
    userId: "u1",
    vaultUnlocked: false,
    hasVaultBundle: authVaultState.hasVaultBundle,
    applyUnlockedSecrets: vi.fn(),
    currentDeviceId: null,
    deviceTrustStatus: authVaultState.deviceTrustStatus,
    refreshDeviceTrust: vi.fn(async () => undefined),
    markDeviceBlockedForever: vi.fn(),
    profile: { email: "user@okkey.local", firstName: "Test", lastName: "User" },
    logout: vi.fn(),
  }),
}));

vi.mock("@okkey-enterprise/account-recovery", () => ({
  default: {
    DevicesRestorePanel: (props: {
      newPassword: string;
      setNewPassword: (value: string) => void;
      repeatPassword: string;
      setRepeatPassword: (value: string) => void;
      passwordValid: boolean;
      submitting: boolean;
      onVaultKeyRecovered: (
        vaultKey: Uint8Array,
        approval?: { requestId: string },
      ) => Promise<void>;
    }) => (
      <div>
        <input
          aria-label="device new password"
          value={props.newPassword}
          onChange={(event) => props.setNewPassword(event.target.value)}
        />
        <input
          aria-label="device repeat password"
          value={props.repeatPassword}
          onChange={(event) => props.setRepeatPassword(event.target.value)}
        />
        <button
          type="button"
          disabled={!props.passwordValid || props.submitting}
          onClick={() =>
            void props.onVaultKeyRecovered(new Uint8Array(32), { requestId: "device-req" })
          }
        >
          finish devices
        </button>
      </div>
    ),
    ContactsRestorePanel: (props: {
      newPassword: string;
      setNewPassword: (value: string) => void;
      repeatPassword: string;
      setRepeatPassword: (value: string) => void;
      passwordValid: boolean;
      submitting: boolean;
      onVaultKeyRecovered: (
        vaultKey: Uint8Array,
        approval?: { requestId: string },
      ) => Promise<void>;
    }) => (
      <div>
        <input
          aria-label="contact new password"
          value={props.newPassword}
          onChange={(event) => props.setNewPassword(event.target.value)}
        />
        <input
          aria-label="contact repeat password"
          value={props.repeatPassword}
          onChange={(event) => props.setRepeatPassword(event.target.value)}
        />
        <button
          type="button"
          disabled={!props.passwordValid || props.submitting}
          onClick={() =>
            void props.onVaultKeyRecovered(new Uint8Array(32), { requestId: "contact-req" })
          }
        >
          finish contacts
        </button>
      </div>
    ),
    ContactsEnrollPanel: null,
    DeviceApproveInbox: null,
    ContactsReleaseInbox: null,
    ContactsShareAutoEnrollController: null,
    TrustedContactsSection: null,
    TrustedContactInviteController: null,
  },
}));

function status(flags: { key?: boolean; devices?: boolean; contacts?: boolean }) {
  return {
    entitlements: {
      recoveryKey: true,
      trustedDevices: flags.devices === true,
      trustedContacts: flags.contacts === true,
    },
    settings: {
      keyEnabled: flags.key === true,
      devicesEnabled: flags.devices === true,
      contactsEnabled: flags.contacts === true,
    },
    key: {
      enrolled: flags.key === true,
      createdAt: "2026-01-01T00:00:00.000Z",
      rotatedAt: null,
      exportedAt: "2026-01-02T00:00:00.000Z",
    },
    contacts: [],
    confirmedContactCount: 0,
    minConfirmedContacts: 3,
    pendingInvites: [],
    servingAsContact: [],
  };
}

function ensureLocalStorage(): void {
  if (typeof localStorage?.getItem === "function" && typeof localStorage?.setItem === "function") {
    return;
  }
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  });
}

function renderPage() {
  return render(
    <LocaleProvider>
      <MemoryRouter>
        <AccountRestorePage />
      </MemoryRouter>
    </LocaleProvider>,
  );
}

async function typePassword(newLabel: string, repeatLabel: string) {
  fireEvent.change(await screen.findByLabelText(newLabel), {
    target: { value: "correct horse" },
  });
  fireEvent.change(screen.getByLabelText(repeatLabel), {
    target: { value: "correct horse" },
  });
}

function staleLocalVaultBundle() {
  return {
    device_share_b64: "c3RhbGUtc2hhcmUtYg",
    password_kdf_salt_b64: "c2FsdA",
    password_kdf_params_version: 2,
    encrypted_private_key: {
      crypto_version: 2,
      algorithm: "xchacha20-poly1305",
      payload: "local-identity",
      meta: {},
    },
  };
}

describe("AccountRestorePage approved recovery", () => {
  beforeEach(() => {
    ensureLocalStorage();
    order.length = 0;
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    authVaultState.deviceTrustStatus = "pending";
    authVaultState.hasVaultBundle = false;
    vaultBundleMocks.readVaultBundle.mockReset();
    vaultBundleMocks.writeVaultBundle.mockReset();
    vaultBundleMocks.readVaultBundle.mockReturnValue(null);
    cryptoMocks.openStoredSplitKeyShareB.mockReset();
    cryptoMocks.sealSplitKeyShareB.mockClear();
    cryptoMocks.rebalanceServerShareForNewPassword.mockClear();
    core.getAccountRecoveryStatus.mockReset();
    core.changeMasterPassword.mockReset();
    core.getAccountRecoveryIdentityEncryptedKey.mockReset();
    core.listWorkspaces.mockReset();
    core.rotateAccountRecoveryKey.mockReset();
    core.proveAccountRecoveryKey.mockReset();
    core.getAccountRecoveryKeyWrap.mockReset();
    core.post.mockReset();
    registerCurrentBrowserDevice.mockReset();

    core.changeMasterPassword.mockImplementation(async () => {
      order.push("change");
      return { master_password_changed_at: "2026-06-01T00:00:00.000Z" };
    });
    core.getAccountRecoveryIdentityEncryptedKey.mockImplementation(async () => {
      order.push("identity");
      return {
        encrypted_private_key: {
          crypto_version: 2,
          algorithm: "xchacha20-poly1305",
          payload: "abc",
          meta: {},
        },
      };
    });
    core.listWorkspaces.mockResolvedValue([]);
    core.rotateAccountRecoveryKey.mockResolvedValue({});
    core.proveAccountRecoveryKey.mockImplementation(async (body: { challenge?: string }) => {
      order.push("prove");
      if (!body?.challenge) {
        return {
          proved: false,
          challenge: "chal",
          deviceId: "d-pending",
          expiresAt: "2099-01-01T00:00:00.000Z",
        };
      }
      return { proved: true };
    });
    core.getAccountRecoveryKeyWrap.mockResolvedValue({
      encryptedBlob: {
        crypto_version: 2,
        algorithm: "xchacha20-poly1305",
        payload: "abc",
        meta: {},
      },
    });
    core.post.mockImplementation(async (path: string) => {
      order.push(`post ${path}`);
      return {};
    });
    registerCurrentBrowserDevice.mockImplementation(
      async (_client: unknown, _fingerprint: string, options?: { recoveryPending?: boolean; claimAfterRecovery?: boolean }) => {
        if (options?.recoveryPending) {
          order.push("pending");
        } else if (options?.claimAfterRecovery) {
          order.push("claim");
        } else {
          order.push("register");
        }
        return { device_id: "d-pending", status: "pending_approval" };
      },
    );
  });

  it("completes a device approval before changing the master password", async () => {
    core.getAccountRecoveryStatus.mockResolvedValue(status({ devices: true }));
    renderPage();

    await typePassword("device new password", "device repeat password");
    fireEvent.click(screen.getByRole("button", { name: "finish devices" }));

    await waitFor(() => {
      expect(order).toEqual([
        "post /enterprise/account/recovery/devices/requests/device-req/complete",
        "change",
        "identity",
        "pending",
        "claim",
      ]);
    });
  });

  it("completes a contact approval and continues when the plugin is absent", async () => {
    core.getAccountRecoveryStatus.mockResolvedValue(status({ contacts: true }));
    core.post.mockImplementation(async (path: string) => {
      order.push(`post ${path}`);
      throw new ApiRequestError(404, {
        error: "NOT_FOUND",
        message: "missing",
        requestId: "r",
      });
    });
    renderPage();

    await typePassword("contact new password", "contact repeat password");
    fireEvent.click(screen.getByRole("button", { name: "finish contacts" }));

    await waitFor(() => {
      expect(order).toEqual([
        "post /enterprise/account/recovery/contacts/requests/contact-req/complete",
        "change",
        "identity",
        "claim",
      ]);
    });
  });

  it("keeps recovery-key restore on the possession proof path", async () => {
    core.getAccountRecoveryStatus.mockResolvedValue(status({ key: true }));
    renderPage();

    fireEvent.change(await screen.findByLabelText(/^recovery key$/i), {
      target: { value: "saved-recovery-key" },
    });
    fireEvent.change(screen.getByLabelText(/^new master password$/i), {
      target: { value: "correct horse" },
    });
    fireEvent.change(screen.getByLabelText(/^repeat new master password$/i), {
      target: { value: "correct horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore access" }));

    await waitFor(() => {
      expect(order).toEqual(["pending", "prove", "prove", "change", "identity", "claim"]);
    });
    expect(core.post).not.toHaveBeenCalled();
  });

  it("mints a fresh device share when a stale local bundle exists on a pending browser", async () => {
    authVaultState.hasVaultBundle = true;
    vaultBundleMocks.readVaultBundle.mockReturnValue(staleLocalVaultBundle());
    cryptoMocks.openStoredSplitKeyShareB.mockRejectedValue(
      new Error("CryptoSdkError openStoredSplitKeyShareB: aead::Error"),
    );
    core.getAccountRecoveryStatus.mockResolvedValue(status({ devices: true }));
    renderPage();

    await typePassword("device new password", "device repeat password");
    fireEvent.click(screen.getByRole("button", { name: "finish devices" }));

    await waitFor(() => {
      expect(order).toEqual([
        "post /enterprise/account/recovery/devices/requests/device-req/complete",
        "change",
        "pending",
        "claim",
      ]);
    });
    expect(cryptoMocks.openStoredSplitKeyShareB).not.toHaveBeenCalled();
    expect(cryptoMocks.sealSplitKeyShareB).toHaveBeenCalled();
    expect(vaultBundleMocks.writeVaultBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        device_share_b64: expect.any(String),
        encrypted_private_key: expect.objectContaining({ payload: "local-identity" }),
      }),
      "u1",
    );
  });

  it("reuses an openable local share on a trusted browser without claiming", async () => {
    authVaultState.deviceTrustStatus = "trusted";
    authVaultState.hasVaultBundle = true;
    vaultBundleMocks.readVaultBundle.mockReturnValue(staleLocalVaultBundle());
    cryptoMocks.openStoredSplitKeyShareB.mockResolvedValue(new Uint8Array(32).fill(9));
    core.getAccountRecoveryStatus.mockResolvedValue(status({ key: true }));
    renderPage();

    fireEvent.change(await screen.findByLabelText(/^recovery key$/i), {
      target: { value: "saved-recovery-key" },
    });
    fireEvent.change(screen.getByLabelText(/^new master password$/i), {
      target: { value: "correct horse" },
    });
    fireEvent.change(screen.getByLabelText(/^repeat new master password$/i), {
      target: { value: "correct horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore access" }));

    await waitFor(() => {
      expect(order).toEqual(["pending", "prove", "prove", "change"]);
    });
    expect(cryptoMocks.openStoredSplitKeyShareB).toHaveBeenCalled();
    expect(cryptoMocks.sealSplitKeyShareB).not.toHaveBeenCalled();
    expect(registerCurrentBrowserDevice).toHaveBeenCalledTimes(1);
    expect(registerCurrentBrowserDevice.mock.calls[0]?.[2]).toMatchObject({
      recoveryPending: true,
    });
  });

  it("mints and claims when a trusted browser cannot open its local share", async () => {
    authVaultState.deviceTrustStatus = "trusted";
    authVaultState.hasVaultBundle = true;
    vaultBundleMocks.readVaultBundle.mockReturnValue(staleLocalVaultBundle());
    cryptoMocks.openStoredSplitKeyShareB.mockRejectedValue(
      new Error("CryptoSdkError openStoredSplitKeyShareB: aead::Error"),
    );
    core.getAccountRecoveryStatus.mockResolvedValue(status({ key: true }));
    renderPage();

    fireEvent.change(await screen.findByLabelText(/^recovery key$/i), {
      target: { value: "saved-recovery-key" },
    });
    fireEvent.change(screen.getByLabelText(/^new master password$/i), {
      target: { value: "correct horse" },
    });
    fireEvent.change(screen.getByLabelText(/^repeat new master password$/i), {
      target: { value: "correct horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore access" }));

    await waitFor(() => {
      expect(order).toEqual(["pending", "prove", "prove", "change", "claim"]);
    });
    expect(cryptoMocks.openStoredSplitKeyShareB).toHaveBeenCalled();
    expect(cryptoMocks.sealSplitKeyShareB).toHaveBeenCalled();
  });
});
