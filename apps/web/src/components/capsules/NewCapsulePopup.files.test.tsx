import type { Workspace } from "@okkey/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

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

const t = (key: string) =>
  (
    {
      "web.capsules.popup.newTitle": "New capsule",
      "web.capsules.list.type.text": "Text",
      "web.capsules.list.type.file": "File",
      "web.capsules.list.type.item": "Item",
      "web.capsules.popup.fileUploadLabel": "Upload file",
      "web.newItemPopup.cancel": "Cancel",
      "web.newItemPopup.save": "Save",
    } as Record<string, string>
  )[key] ?? key;

function workspace(planTier: Workspace["planTier"]): Workspace {
  return {
    id: "workspace-1",
    name: "Personal",
    ownerId: "user-1",
    planTier,
    planCustomOverride: false,
    planFeatureOverrides: {},
    deletedItemsRetentionDays: 30,
    allowedFileExtensions: ["pdf"],
    maxFileSizeMb: 2,
    filesInItemsEnabled: planTier !== "FREE",
    capsulePolicies: {
      allowMode: "all",
      allowMemberIds: [],
      allowedCapsuleTypes: ["text", "file", "item"],
      forceMaxViews: 0,
      requireTimeDeactivation: false,
      requireAccess: false,
      accessAudience: "all_users",
      requirePassword: false,
      passwordAttemptLimit: 0,
      requireApproval: false,
    },
    monitoringCardSettings: {
      overall: true,
      strength: true,
      reused: true,
      weak: true,
      compromised: true,
      stale: true,
      passkeyGap: true,
      twoFactorGap: true,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function renderPopup(planTier: Workspace["planTier"]) {
  return render(
    <MemoryRouter initialEntries={["/capsules?popup=newCapsule"]}>
      <NewCapsulePopup t={t} workspaceId="workspace-1" workspace={workspace(planTier)} />
    </MemoryRouter>,
  );
}

describe("NewCapsulePopup file attach control", () => {
  afterEach(() => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "saas");
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "false");
  });

  it("hides the file type and upload button on SaaS FREE", () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "saas");
    renderPopup("FREE");

    expect(screen.getByRole("button", { name: "Text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Item" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "File" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Upload file/ })).not.toBeInTheDocument();
  });

  it("shows the file upload button on SaaS PREMIUM", () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "saas");
    renderPopup("PREMIUM");

    fireEvent.click(screen.getByRole("button", { name: "File" }));
    expect(screen.getByRole("button", { name: /Upload file/ })).toBeInTheDocument();
  });

  it("shows the file upload button on self-hosted FREE", () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "false");
    renderPopup("FREE");

    fireEvent.click(screen.getByRole("button", { name: "File" }));
    expect(screen.getByRole("button", { name: /Upload file/ })).toBeInTheDocument();
  });
});
