import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import WorkspaceSettingsVaultsSection from "./WorkspaceSettingsVaultsSection";

vi.mock("../../../../auth/AuthVaultContext", () => ({
  useAuthenticatedCoreClient: () => ({ updateVault: vi.fn() }),
  useAuthVault: () => ({ userId: "u1", vaultKey: null }),
}));

vi.mock("../../../../auth/usePopupZoneGate", () => ({
  usePopupZoneGate: (_zone: string, open: boolean) => open,
}));

const personalPopupSpy = vi.fn();

vi.mock("@okkey-enterprise/workspace-shared-vaults", () => ({
  default: {
    SharedVaultsSection: null,
    PersonalVaultCardPopup: (props: { initialVault: { name: string }; mode: string }) => {
      personalPopupSpy(props);
      return (
        <div data-testid="personal-vault-popup">
          <span>{props.initialVault.name}</span>
        </div>
      );
    },
    SharedVaultCardPopup: null,
  },
}));

const t = (key: string) => {
  const map: Record<string, string> = {
    "web.workspaceSettings.sections.vaults": "Сейфы",
    "web.workspaceSettings.vaults.intro": "Intro",
    "web.workspaceSettings.vaults.learnMore": "Подробнее",
    "web.workspaceSettings.vaults.learnMoreUrl": "https://example.com",
    "web.workspaceSettings.vaults.personal.title": "Личный сейф",
    "web.workspaceSettings.vaults.personal.description": "Personal desc",
    "web.workspaceSettings.vaults.personal.onlyYou": "Доступен только Вам",
    "web.workspaceSettings.vaults.shared.title": "Общие сейфы",
    "web.workspaceSettings.vaults.shared.subtitle": "Shared subtitle",
    "web.workspaceSettings.vaults.shared.create": "Создать",
    "web.workspaceSettings.vaults.card.createTitle": "Создать сейф",
    "web.workspaceSettings.vaults.upsellNoteTitle": "Note",
    "web.workspaceSettings.vaults.upsellPrefix": "Prefix ",
    "web.workspaceSettings.vaults.upsellPlanLink": "Plan",
    "web.workspaceSettings.vaults.upsellSuffix": " suffix",
    "web.workspaceSettings.vaults.memberCount": "1 участник",
    "web.workspaceSettings.vaults.loading": "Loading",
  };
  return map[key] ?? key;
};

const freeWorkspace = {
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
    forceMaxViews: 0,
    requireTimeDeactivation: false,
    requireAccess: false,
    accessAudience: "all_users" as const,
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
  createdAt: "",
  updatedAt: "",
};

const personalVault = {
  id: "v1",
  workspaceId: "w1",
  name: "Мой сейф",
  description: "My vault",
  icon: "🏠",
  isPersonal: true,
  ownerId: "u1",
  cryptoVersion: 2,
  createdAt: "",
  updatedAt: "",
};

describe("WorkspaceSettingsVaultsSection", () => {
  it("renders personal vault and shared section upsell on FREE", () => {
    render(
      <MemoryRouter>
        <WorkspaceSettingsVaultsSection
          workspaceId="w1"
          workspace={freeWorkspace}
          vaults={[personalVault]}
          t={t}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Сейфы")).toBeInTheDocument();
    expect(screen.getByText("Мой сейф")).toBeInTheDocument();
    expect(screen.getByText("Доступен только Вам")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Мой сейф/i })).toBeInTheDocument();
    expect(screen.getByText("Общие сейфы")).toBeInTheDocument();
    expect(screen.getByText("Note")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Создать/i })).not.toBeInTheDocument();
  });

  it("opens personal vault edit on FREE without sharedVaults and keeps stored name", () => {
    personalPopupSpy.mockClear();

    render(
      <MemoryRouter initialEntries={["/settings/vaults"]}>
        <WorkspaceSettingsVaultsSection
          workspaceId="w1"
          workspace={freeWorkspace}
          vaults={[personalVault]}
          t={t}
          resourcePermissions={{ get: 1, post: 0, put: 1, delete: 0 }}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Мой сейф/i }));

    expect(screen.getByTestId("personal-vault-popup")).toBeInTheDocument();
    expect(personalPopupSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "personal",
        initialVault: expect.objectContaining({ name: "Мой сейф" }),
      }),
    );
  });
});
