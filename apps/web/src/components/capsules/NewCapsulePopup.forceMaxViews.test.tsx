import type { Workspace } from "@okkey/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const cryptoMock = vi.hoisted(() => ({
  encryptCapsulePayload: vi.fn(),
  decryptCapsuleMetadata: vi.fn(),
  decryptCapsulePayload: vi.fn(),
  exportCapsuleGuestKeyFragment: vi.fn(),
  encryptCapsuleMetadata: vi.fn(),
  generateCapsuleKey: vi.fn(),
  unwrapCapsuleKeyForOwner: vi.fn(),
  wrapCapsuleKeyForOwner: vi.fn(),
  wipeBytes: vi.fn(),
  decryptUserIdentityFromEncryptedBlob: vi.fn(),
  unwrapVaultKeyForSelf: vi.fn(),
  encryptAttachmentPayload: vi.fn(),
  decryptAttachmentPayload: vi.fn(),
  decryptVaultItemPayload: vi.fn(),
  initCrypto: vi.fn(async () => {}),
}));

vi.mock("@okkey/crypto", () => cryptoMock);
vi.mock("@okkey/crypto/vault-item", () => ({
  encryptVaultItemPayload: vi.fn(),
  decryptVaultItemPayload: vi.fn(),
}));

vi.mock("../../auth/AuthVaultContext", () => ({
  useAuthenticatedCoreClient: () => null,
  useAuthVault: () => ({
    vaultKey: new Uint8Array(32),
    accessToken: "token",
    userId: "user-1",
  }),
}));

vi.mock("../../locale/LocaleContext", () => ({
  useLocale: () => ({
    locale: "en" as const,
    setLocale: () => {},
    t: (key: string) => key,
  }),
}));

vi.mock("../../items/WorkspaceItemsContext", () => ({
  useWorkspaceItems: () => ({
    items: [],
    records: [],
    fileUploadConstraints: {
      allowedExtensions: ["pdf"],
      maxSizeBytes: 2 * 1024 * 1024,
    },
    resolveVaultEncryptionKey: vi.fn(),
  }),
}));

vi.mock("../../auth/usePopupZoneGate", () => ({
  usePopupZoneGate: (_zone: string, open: boolean) => open,
}));

vi.mock("../../auth/SectionReauthContext", () => ({
  useSectionReauth: () => ({
    requestZoneUnlock: vi.fn().mockResolvedValue(true),
  }),
}));

import NewCapsulePopup from "./NewCapsulePopup";

const t = (key: string) => key;

function workspace(mode: "saas" | "self_hosted"): Workspace {
  return {
    id: "workspace-1",
    name: "Personal",
    ownerId: "user-1",
    planTier: mode === "self_hosted" ? "ENTERPRISE" : "FREE",
    planCustomOverride: false,
    planFeatureOverrides: {},
    deletedItemsRetentionDays: 30,
    allowedFileExtensions: ["pdf"],
    maxFileSizeMb: 2,
    filesInItemsEnabled: mode === "self_hosted",
    capsulePolicies: {
      allowMode: "all",
      allowMemberIds: [],
      allowedCapsuleTypes: ["text", "file", "item"],
      forceMaxViews: 5,
      requireTimeDeactivation: true,
      requireAccess: true,
      accessAudience: "workspace_members_only",
      requirePassword: true,
      passwordAttemptLimit: 3,
      requireApproval: true,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function renderPopup(mode: "saas" | "self_hosted") {
  vi.stubEnv("VITE_DEPLOYMENT_MODE", mode);
  vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "false");
  return render(
    <MemoryRouter initialEntries={["/capsules?popup=newCapsule"]}>
      <NewCapsulePopup t={t} workspaceId="workspace-1" workspace={workspace(mode)} />
    </MemoryRouter>,
  );
}

describe("NewCapsulePopup forceMaxViews on FREE", () => {
  it.each(["saas", "self_hosted"] as const)(
    "shows a locked view limit and hides access settings (%s)",
    (mode) => {
      renderPopup(mode);

      fireEvent.click(screen.getByRole("button", { name: /web\.capsules\.popup\.advancedSettings/ }));

      const limit = screen.getByRole("spinbutton");
      expect(limit).toBeDisabled();
      expect(limit).toHaveValue(5);
      expect(screen.getByText("web.capsules.popup.views.title")).toBeInTheDocument();
      expect(screen.queryByText("web.capsules.popup.password.title")).not.toBeInTheDocument();
      expect(screen.queryByText("web.capsules.popup.time.title")).not.toBeInTheDocument();
      expect(screen.queryByText("web.capsules.popup.access.title")).not.toBeInTheDocument();
      expect(screen.queryByText("web.capsules.popup.approval.title")).not.toBeInTheDocument();
    },
  );
});
