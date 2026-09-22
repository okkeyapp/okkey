import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const coreMocks = vi.hoisted(() => ({
  getAccountRecoveryStatus: vi.fn(),
  patchAccountRecoverySettings: vi.fn(),
  enrollAccountRecoveryKey: vi.fn(),
  rotateAccountRecoveryKey: vi.fn(),
  ackAccountRecoveryKeyExport: vi.fn(),
  inviteTrustedContact: vi.fn(),
  deleteTrustedContact: vi.fn(),
  acceptTrustedContactInvite: vi.fn(),
  rejectTrustedContactInvite: vi.fn(),
}));

vi.mock("@okkey/crypto", () => ({
  initCrypto: vi.fn(async () => undefined),
  generateRecoverySecret: vi.fn(async () => "AAAA-BBBB-CCCC-DDDD"),
  wrapVaultKeyWithRecoverySecret: vi.fn(async () => ({
    crypto_version: 2,
    algorithm: "xchacha20-poly1305",
    payload: "abc",
    meta: { entity: "vault_key_recovery_wrap", key_scope: "account" },
  })),
}));

vi.mock("../../auth/AuthVaultContext", () => ({
  useAuthenticatedCoreClient: () => coreMocks,
  useAuthVault: () => ({
    vaultKey: new Uint8Array(32),
    accessToken: "token",
    userId: "u1",
    vaultUnlocked: true,
    profile: { email: "owner@example.com", firstName: null, lastName: null },
  }),
}));

vi.mock("../../locale/LocaleContext", () => ({
  useLocale: () => ({ locale: "ru", t: (key: string) => key }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

import SettingsRecoveryContent from "./SettingsRecoveryContent";
import { clearSettingsPopupCache } from "./settingsPopupCache";

const t = (key: string) => key;

function freeStatus(overrides?: Record<string, unknown>) {
  return {
    entitlements: {
      recoveryKey: true,
      trustedDevices: false,
      trustedContacts: false,
    },
    settings: {
      keyEnabled: true,
      devicesEnabled: false,
      contactsEnabled: false,
    },
    key: {
      enrolled: true,
      createdAt: "2026-03-02T21:59:00.000Z",
      rotatedAt: null,
      exportedAt: null,
    },
    contacts: [],
    confirmedContactCount: 0,
    minConfirmedContacts: 3,
    pendingInvites: [],
    servingAsContact: [],
    ...overrides,
  };
}

describe("SettingsRecoveryContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSettingsPopupCache();
    coreMocks.getAccountRecoveryStatus.mockResolvedValue(freeStatus());
  });

  it("shows recovery key and a single paid upsell when devices/contacts are unavailable", async () => {
    render(
      <MemoryRouter>
        <SettingsRecoveryContent t={t} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("web.settingsPopup.recovery.key.label")).toBeTruthy();
    });
    expect(screen.queryByText("web.settingsPopup.recovery.devices.label")).toBeNull();
    expect(screen.queryByText("web.settingsPopup.recovery.contacts.label")).toBeNull();
    expect(
      screen.getByText((_, node) => {
        if (!node || node.children.length === 0) {
          return false;
        }
        return Array.from(node.childNodes).some(
          (child) =>
            child.nodeType === Node.TEXT_NODE &&
            (child.textContent ?? "").includes(
              "web.settingsPopup.recovery.upsell.combinedPrefix",
            ),
        );
      }),
    ).toBeTruthy();
  });

  it("lists trusted contacts when paid entitlement is present", async () => {
    coreMocks.getAccountRecoveryStatus.mockResolvedValue(
      freeStatus({
        entitlements: {
          recoveryKey: true,
          trustedDevices: true,
          trustedContacts: true,
        },
        settings: {
          keyEnabled: true,
          devicesEnabled: true,
          contactsEnabled: false,
        },
        contacts: [
          {
            id: "1",
            email: "a@example.com",
            status: "confirmed",
            createdAt: "2026-01-01T00:00:00.000Z",
            confirmedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "2",
            email: "b@example.com",
            status: "pending",
            createdAt: "2026-01-02T00:00:00.000Z",
            confirmedAt: null,
          },
        ],
        confirmedContactCount: 1,
      }),
    );

    render(
      <MemoryRouter>
        <SettingsRecoveryContent t={t} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("a@example.com")).toBeTruthy();
    });
    expect(screen.getByText("b@example.com")).toBeTruthy();
    expect(screen.getByText("web.settingsPopup.recovery.contacts.add")).toBeTruthy();
  });

  it("lists accounts where the current user serves as a trusted contact", async () => {
    coreMocks.getAccountRecoveryStatus.mockResolvedValue(
      freeStatus({
        entitlements: {
          recoveryKey: true,
          trustedDevices: false,
          trustedContacts: false,
        },
        servingAsContact: [
          {
            id: "m1",
            ownerEmail: "owner@example.com",
            ownerFirstName: "Alex",
            ownerLastName: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            confirmedAt: "2026-01-02T00:00:00.000Z",
          },
        ],
      }),
    );

    render(
      <MemoryRouter>
        <SettingsRecoveryContent t={t} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("web.settingsPopup.recovery.servingAs.label")).toBeTruthy();
    });
    expect(screen.getByText("owner@example.com")).toBeTruthy();
    expect(
      screen.getByLabelText("web.settingsPopup.recovery.servingAs.remove"),
    ).toBeTruthy();
  });
});
