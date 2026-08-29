import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import WorkspaceSettingsVaultsSection from "./WorkspaceSettingsVaultsSection";

vi.mock("../../../../auth/AuthVaultContext", () => ({
  useAuthenticatedCoreClient: () => null,
  useAuthVault: () => ({ userId: "u1", vaultKey: null }),
}));

vi.mock("@okkey-enterprise/workspace-shared-vaults", () => ({
  default: {
    SharedVaultsSection: null,
    PersonalVaultCardPopup: null,
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
  };
  return map[key] ?? key;
};

describe("WorkspaceSettingsVaultsSection", () => {
  it("renders personal vault and shared section upsell on FREE", () => {
    render(
      <MemoryRouter>
        <WorkspaceSettingsVaultsSection
          workspaceId="w1"
          workspace={{
            id: "w1",
            name: "WS",
            ownerId: "u1",
            planTier: "FREE",
            deletedItemsRetentionDays: 30,
            allowedFileExtensions: [],
            maxFileSizeMb: 2,
            filesInItemsEnabled: true,
            capsulePolicies: {
              allowMode: "all",
              allowMemberIds: [],
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
            createdAt: "",
            updatedAt: "",
          }}
          vaults={[
            {
              id: "v1",
              workspaceId: "w1",
              name: "Personal",
              description: "My vault",
              icon: "🏠",
              isPersonal: true,
              ownerId: "u1",
              cryptoVersion: 2,
              createdAt: "",
              updatedAt: "",
            },
          ]}
          t={t}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Сейфы")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(screen.getByText("Доступен только Вам")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Personal/i })).not.toBeInTheDocument();
    expect(screen.getByText("Общие сейфы")).toBeInTheDocument();
    expect(screen.getByText("Note")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Создать/i })).not.toBeInTheDocument();
  });
});
