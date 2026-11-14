import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountLoginMethodsResponseDto } from "@okkey/types";

import { clearSettingsPopupCache } from "./settingsPopupCache";
import SettingsLoginContent from "./SettingsLoginContent";

const core = vi.hoisted(() => ({
  getLoginMethods: vi.fn(),
  deletePasskeyShareWrap: vi.fn(),
}));

vi.mock("../../auth/AuthVaultContext", () => ({
  useAuthenticatedCoreClient: () => core,
  useAuthVault: () => ({ userId: "user-1", vaultUnlocked: true }),
}));

vi.mock("../../auth/accountWebAuthnCapability", () => ({
  accountWebAuthnErrorMessageKey: (code: string) => `web.settingsLogin.webauthn.error.${code}`,
  getAccountWebAuthnCapability: vi.fn(async () => ({ status: "ready" })),
  getPasskeyLoginCapability: vi.fn(async () => ({ status: "ready" })),
  getHardwareKeyLoginCapability: vi.fn(async () => ({ status: "unavailable", code: "unavailable" })),
  mapAccountWebAuthnError: () => "failed",
}));

vi.mock("../../auth/passkeyDeviceApproval", () => ({
  establishPasskeyShareWrap: vi.fn(),
  passkeyWrapErrorMessageKey: (code: string) => `web.settingsLogin.passkeyWrap.${code}`,
}));

const copy: Record<string, string> = {
  "web.settingsLogin.passkey.label": "Passkey",
  "web.settingsLogin.passkey.description": "Sign in with a passkey",
  "web.settingsLogin.hardware.label": "Hardware key",
  "web.settingsLogin.hardware.description": "Use a hardware key",
  "web.settingsLogin.email.label": "Email",
  "web.settingsLogin.email.description": "Email code",
  "web.settingsLogin.primary.label": "Primary",
  "web.settingsLogin.primary.description": "Primary method",
  "web.settingsLogin.method.email": "Email",
  "web.settingsLogin.method.passkey": "Passkey",
  "web.settingsLogin.method.hardware": "Hardware key",
  "web.settingsLogin.add": "Add",
  "web.settingsLogin.deleteCredential": "Remove key",
  "web.settingsLogin.passkeyWrap.action": "Allow this passkey to approve new devices",
  "web.settingsLogin.passkeyWrap.ready": "This passkey can approve a new device",
  "web.settingsLogin.passkeyWrap.revoke": "Remove device approval from this passkey",
};

function t(key: string): string {
  return copy[key] ?? key;
}

function loginMethods(grantedIds: string[]): AccountLoginMethodsResponseDto {
  return {
    primary: "email",
    email: "ada@example.com",
    passkeys: [
      {
        id: "11",
        name: "Passkey",
        created_at: "2026-01-01T00:00:00.000Z",
        last_used_at: null,
        has_share_wrap: grantedIds.includes("11"),
      },
      {
        id: "12",
        name: "Phone",
        created_at: "2026-01-02T00:00:00.000Z",
        last_used_at: null,
        has_share_wrap: grantedIds.includes("12"),
      },
    ],
    hardware_keys: [],
  };
}

describe("SettingsLoginContent passkey approval row", () => {
  beforeEach(() => {
    clearSettingsPopupCache();
    core.getLoginMethods.mockReset();
    core.deletePasskeyShareWrap.mockReset();
  });

  it("shows the allow action inside the card and a separate add card", async () => {
    core.getLoginMethods.mockResolvedValue(loginMethods([]));
    render(<SettingsLoginContent t={t} />);

    const allow = await screen.findAllByRole("button", {
      name: "Allow this passkey to approve new devices",
    });
    expect(allow).toHaveLength(2);
    expect(screen.queryByText("This passkey can approve a new device")).toBeNull();
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
  });

  it("shows granted text and a revoke control instead of the allow action", async () => {
    core.getLoginMethods.mockResolvedValue(loginMethods(["11"]));
    render(<SettingsLoginContent t={t} />);

    expect(await screen.findByText("This passkey can approve a new device")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove device approval from this passkey" })).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Allow this passkey to approve new devices" }),
    ).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
  });

  it("revokes approval and drops the granted row", async () => {
    let current = loginMethods(["11"]);
    core.getLoginMethods.mockImplementation(async () => current);
    core.deletePasskeyShareWrap.mockImplementation(async () => {
      current = loginMethods([]);
      return { credential_id: "11", has_share_wrap: false as const };
    });
    render(<SettingsLoginContent t={t} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Remove device approval from this passkey" }),
    );

    expect(core.deletePasskeyShareWrap).toHaveBeenCalledWith("11");
    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: "Allow this passkey to approve new devices" }),
      ).toHaveLength(2);
    });
    expect(screen.queryByText("This passkey can approve a new device")).toBeNull();
  });
});
