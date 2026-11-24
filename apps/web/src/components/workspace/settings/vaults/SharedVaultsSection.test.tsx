import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import SharedVaultsSection from "./SharedVaultsSection";

vi.mock("../../../../auth/AuthVaultContext", () => ({
  useAuthenticatedCoreClient: () => ({
    listWorkspaceMembers: vi.fn().mockResolvedValue({ members: [] }),
    listWorkspaceProfiles: vi.fn().mockResolvedValue({ profiles: [] }),
  }),
  useAuthVault: () => ({ userId: "u1", vaultKey: null }),
}));

vi.mock("../../../../auth/usePopupZoneGate", () => ({
  usePopupZoneGate: () => false,
}));

vi.mock("./VaultCardPopup", () => ({
  default: () => null,
}));

const t = (key: string) => {
  const map: Record<string, string> = {
    "web.workspaceSettings.vaults.shared.title": "Shared vaults",
    "web.workspaceSettings.vaults.shared.subtitle": "Shared subtitle",
    "web.workspaceSettings.vaults.shared.create": "Create",
  };
  return map[key] ?? key;
};

const workspace = {
  id: "w1",
  name: "WS",
  ownerId: "u1",
  planTier: "FREE" as const,
  planCustomOverride: false,
  planFeatureOverrides: {},
  deletedItemsRetentionDays: 30,
  allowedFileExtensions: [] as string[],
  maxFileSizeMb: 2,
  filesInItemsEnabled: true,
  capsulePolicies: {
    allowMode: "all" as const,
    allowMemberIds: [] as string[],
    allowedCapsuleTypes: ["text", "file", "item"] as const,
    forceMaxViews: 0,
    requireTimeDeactivation: false,
    requireAccess: false,
    accessAudience: "all_users" as const,
    requirePassword: false,
    passwordAttemptLimit: 0,
    requireApproval: false,
  },
  createdAt: "",
  updatedAt: "",
};

describe("SharedVaultsSection", () => {
  it("renders with a workspace prop without throwing", () => {
    expect(() =>
      render(
        <MemoryRouter>
          <SharedVaultsSection workspaceId="w1" workspace={workspace} vaults={[]} t={t} />
        </MemoryRouter>,
      ),
    ).not.toThrow();

    expect(screen.getByRole("heading", { name: "Shared vaults" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });
});
