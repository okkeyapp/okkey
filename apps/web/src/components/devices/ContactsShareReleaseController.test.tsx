import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listContactRequests = vi.fn();

vi.mock("@okkey-enterprise/account-recovery", () => ({
  default: {
    ContactsRestorePanel: () => null,
  },
}));

vi.mock("@okkey-enterprise/api", () => ({
  EnterpriseAccountRecoveryClient: vi.fn().mockImplementation(() => ({
    listContactRequests,
  })),
}));

vi.mock("@okkey-enterprise/recovery-crypto", () => ({
  base64ToBytes: vi.fn(),
  unsealContactShare: vi.fn(),
  wipeBytes: vi.fn(),
  wrapShareForRelease: vi.fn(),
}));

vi.mock("@okkey/crypto", () => ({
  decryptUserIdentityFromEncryptedBlob: vi.fn(),
  initCrypto: vi.fn(),
  unwrapVaultKeyForSelf: vi.fn(),
}));

vi.mock("@okkey/api", () => ({
  createBearerApiClient: vi.fn(() => ({})),
}));

vi.mock("@okkey/ui", () => ({
  Button: (props: { children?: unknown }) => <button type="button">{props.children}</button>,
  Popup: (props: { children?: unknown }) => <div>{props.children}</div>,
}));

vi.mock("../../api/client", () => ({
  getApiBaseUrl: () => "http://localhost:4000",
}));

vi.mock("../../auth/AuthVaultContext", () => ({
  useAuthVault: () => ({
    accessToken: "token",
    userId: "user-1",
    vaultUnlocked: true,
    vaultKey: new Uint8Array(32),
  }),
}));

vi.mock("../../auth/localVaultBundle", () => ({
  readVaultBundle: vi.fn(() => null),
}));

vi.mock("../../locale/LocaleContext", () => ({
  useLocale: () => ({
    locale: "en",
    t: (key: string) => key,
  }),
}));

vi.mock("../../locale/localeStorage", () => ({
  readStoredLocale: () => "en",
}));

vi.mock("../workspace/settings/vaults/vaultAccessHelpers", () => ({
  MemberFavicon: () => null,
  memberDisplayName: () => "User",
}));

describe("ContactsShareReleaseController", () => {
  beforeEach(async () => {
    listContactRequests.mockReset();
    vi.resetModules();
    const { resetBackendEnterpriseModulesActiveForTests } = await import(
      "../../workspace/planEntitlements"
    );
    resetBackendEnterpriseModulesActiveForTests();
  });

  it("does not poll EE contact requests when backend modules are off", async () => {
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "true");
    const { setBackendEnterpriseModulesActive } = await import("../../workspace/planEntitlements");
    setBackendEnterpriseModulesActive(false);
    const { default: ContactsShareReleaseController } = await import(
      "./ContactsShareReleaseController"
    );

    render(<ContactsShareReleaseController />);

    await waitFor(() => {
      expect(listContactRequests).not.toHaveBeenCalled();
    });
  });

  it("polls EE contact requests when modules are on", async () => {
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "true");
    const { setBackendEnterpriseModulesActive } = await import("../../workspace/planEntitlements");
    setBackendEnterpriseModulesActive(true);
    listContactRequests.mockResolvedValue({ requests: [] });
    const { default: ContactsShareReleaseController } = await import(
      "./ContactsShareReleaseController"
    );

    render(<ContactsShareReleaseController />);

    await waitFor(() => {
      expect(listContactRequests).toHaveBeenCalledWith("contact");
    });
  });
});
