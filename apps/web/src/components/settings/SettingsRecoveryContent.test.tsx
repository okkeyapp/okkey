import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const coreMocks = vi.hoisted(() => ({
  getAccountRecoveryStatus: vi.fn(),
  patchAccountRecoverySettings: vi.fn(),
  enrollAccountRecoveryKey: vi.fn(),
  rotateAccountRecoveryKey: vi.fn(),
  ackAccountRecoveryKeyExport: vi.fn(),
  listDevices: vi.fn(),
}));

vi.mock("@okkey/crypto", () => ({
  initCrypto: vi.fn(async () => undefined),
  generateRecoverySecret: vi.fn(async () => "AAAA-BBBB-CCCC-DDDD"),
  recoveryPossessionPublicKey: vi.fn(async () => "cG9zc2Vzc2lvbi1wdWJsaWMta2V5LWJhc2U2NA=="),
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

const recoverySlots = vi.hoisted(() => ({
  TrustedContactsSection: null as ((props: { locked?: boolean }) => JSX.Element) | null,
}));

vi.mock("@okkey-enterprise/account-recovery", () => ({
  default: {
    get TrustedContactsSection() {
      return recoverySlots.TrustedContactsSection;
    },
  },
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
    recoverySlots.TrustedContactsSection = null;
    clearSettingsPopupCache();
    coreMocks.getAccountRecoveryStatus.mockResolvedValue(freeStatus());
    coreMocks.listDevices.mockResolvedValue({ devices: [], pending: [], blocked: [] });
  });

  it("shows recovery key and a single paid upsell when devices/contacts are unavailable", async () => {
    render(
      <MemoryRouter>
        <SettingsRecoveryContent t={t} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: "web.settingsPopup.recovery.devices.label" }),
      ).toBeDisabled();
    });
    expect(screen.getByText("web.settingsPopup.recovery.devices.label")).toBeTruthy();
    expect(screen.getByText("web.settingsPopup.recovery.error.entitlement")).toBeTruthy();
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

  it("does not render the contacts catalog when the slot is empty", async () => {
    coreMocks.getAccountRecoveryStatus.mockResolvedValue(
      freeStatus({
        entitlements: {
          recoveryKey: true,
          trustedDevices: false,
          trustedContacts: true,
        },
      }),
    );

    render(
      <MemoryRouter>
        <SettingsRecoveryContent t={t} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("web.settingsPopup.recovery.key.label")).toBeTruthy();
    });
    expect(screen.queryByText("web.settingsPopup.recovery.contacts.label")).toBeNull();
    expect(screen.queryByTestId("trusted-contacts-section")).toBeNull();
  });

  it("mounts the contacts slot on a free plan with adding locked", async () => {
    recoverySlots.TrustedContactsSection = ({ locked }) => (
      <div data-testid="trusted-contacts-section" data-locked={String(Boolean(locked))} />
    );

    render(
      <MemoryRouter>
        <SettingsRecoveryContent t={t} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("trusted-contacts-section").getAttribute("data-locked")).toBe("true");
    });
  });

  it("mounts the contacts slot when the plan grants trusted contacts", async () => {
    recoverySlots.TrustedContactsSection = () => <div data-testid="trusted-contacts-section" />;
    coreMocks.getAccountRecoveryStatus.mockResolvedValue(
      freeStatus({
        entitlements: {
          recoveryKey: true,
          trustedDevices: false,
          trustedContacts: true,
        },
      }),
    );

    render(
      <MemoryRouter>
        <SettingsRecoveryContent t={t} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("trusted-contacts-section")).toBeTruthy();
    });
  });

  it("blocks enabling trusted-devices recovery until ≥2 trusted devices incl. current", async () => {
    coreMocks.getAccountRecoveryStatus.mockResolvedValue(
      freeStatus({
        entitlements: {
          recoveryKey: true,
          trustedDevices: true,
          trustedContacts: false,
        },
        settings: {
          keyEnabled: true,
          devicesEnabled: false,
          contactsEnabled: false,
        },
      }),
    );
    coreMocks.listDevices.mockResolvedValue({
      devices: [
        {
          device_id: "d1",
          device_name: "This",
          device_fingerprint: "fp1",
          platform: "web",
          os_name: "macOS",
          os_version: "14",
          app_version: "1",
          client_type: "web",
          ip_address: null,
          country: null,
          city: null,
          created_at: "2026-01-01T00:00:00.000Z",
          last_seen_at: null,
          approved_at: null,
          status: "trusted",
          is_current: true,
          approval_expires_at: null,
        },
      ],
      pending: [],
      blocked: [],
    });

    render(
      <MemoryRouter>
        <SettingsRecoveryContent t={t} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("web.settingsPopup.recovery.devices.label")).toBeTruthy();
    });
    const toggle = screen.getByLabelText("web.settingsPopup.recovery.devices.label");
    expect(toggle).toBeDisabled();
    expect(screen.getByText("web.settingsPopup.recovery.devices.needAnother")).toBeTruthy();
  });
});
