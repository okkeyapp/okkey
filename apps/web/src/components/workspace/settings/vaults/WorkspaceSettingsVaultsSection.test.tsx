import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { publicDocsUrl } from "../../../../docs/publicDocsUrl";
import { LocaleProvider } from "../../../../locale/LocaleContext";
import WorkspaceSettingsVaultsSection from "./WorkspaceSettingsVaultsSection";

const deleteVault = vi.fn().mockResolvedValue({ deleted: true });

vi.mock("../../../../auth/AuthVaultContext", () => ({
  useAuthenticatedCoreClient: () => ({ updateVault: vi.fn(), deleteVault }),
  useAuthVault: () => ({ userId: "u1", vaultKey: null }),
}));

vi.mock("../../../../auth/usePopupZoneGate", () => ({
  usePopupZoneGate: (_zone: string, open: boolean) => open,
}));

vi.mock("../../../../auth/SectionReauthContext", () => ({
  useSectionReauth: () => ({
    requestZoneUnlock: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock("../../../../lib/saveWithToast", () => ({
  runSaveWithToast: async (_messages: unknown, action: () => Promise<unknown>) => action(),
}));

const personalPopupSpy = vi.fn();

vi.mock("./SharedVaultsSection", () => ({
  default: ({
    readOnly,
    emptyFallback,
  }: {
    readOnly?: boolean;
    emptyFallback?: ReactNode;
  }) => (
    <div data-testid="shared-vaults">
      {readOnly ? "read-only" : "editable"}
      {readOnly ? emptyFallback : null}
    </div>
  ),
}));

vi.mock("./VaultCardPopup", () => ({
  default: (props: { initialVault: { name: string }; mode: string }) => {
    personalPopupSpy(props);
    return (
      <div data-testid="personal-vault-popup">
        <span>{props.initialVault.name}</span>
      </div>
    );
  },
}));

const t = (key: string) => {
  const map: Record<string, string> = {
    "web.workspaceSettings.sections.vaults": "Сейфы",
    "web.workspaceSettings.vaults.intro": "Intro",
    "web.workspaceSettings.vaults.learnMore": "Подробнее",
    "web.workspaceSettings.vaults.personal.title": "Личный сейф",
    "web.workspaceSettings.vaults.personal.description": "Personal desc",
    "web.workspaceSettings.vaults.personal.onlyYou": "Доступен только Вам",
    "web.workspaceSettings.vaults.shared.title": "Общие сейфы",
    "web.workspaceSettings.vaults.shared.subtitle": "Shared subtitle",
    "web.workspaceSettings.vaults.shared.create": "Создать",
    "web.workspaceSettings.vaults.card.createTitle": "Создать сейф",
    "web.workspaceSettings.vaults.card.editTitle": "Edit vault",
    "web.workspaceSettings.vaults.card.sharedSubtitle": "Shared vault",
    "web.workspaceSettings.vaults.upsellNoteTitle": "Note",
    "web.workspaceSettings.vaults.upsellPrefix": "Prefix ",
    "web.workspaceSettings.vaults.upsellPlanLink": "Plan",
    "web.workspaceSettings.vaults.upsellSuffix": " suffix",
    "web.workspaceSettings.vaults.memberCount": "1 участник",
    "web.workspaceSettings.vaults.loading": "Loading",
    "web.workspaceSettings.vaults.deleteConfirm.title": "Delete vault?",
    "web.workspaceSettings.vaults.deleteConfirm.description": "The vault will be deleted.",
    "web.workspaceSettings.vaults.deleteConfirm.delete": "Delete",
    "web.settingsPopup.close": "Close",
    "web.newItemPopup.cancel": "Cancel",
    "web.items.list.actions": "Actions",
    "web.toast.save.loading": "Saving",
    "web.toast.save.success": "Saved",
    "web.toast.save.error": "Error",
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
  it("renders the personal vault and an editable shared vaults section on FREE", () => {
    render(
      <MemoryRouter>
        <LocaleProvider>
        <WorkspaceSettingsVaultsSection
          workspaceId="w1"
          workspace={freeWorkspace}
          vaults={[personalVault]}
          t={t}
        />
      </LocaleProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText("Сейфы")).toBeInTheDocument();
    const learnMore = screen.getByRole("link", { name: "Подробнее" });
    expect(learnMore).toHaveAttribute("href", publicDocsUrl("workspaceVaults", "en"));
    expect(learnMore).toHaveAttribute("target", "_blank");
    expect(learnMore.getAttribute("rel")).toContain("noopener");
    expect(screen.getByText("Мой сейф")).toBeInTheDocument();
    expect(screen.getByText("Доступен только Вам")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Мой сейф/i })).toBeInTheDocument();
    expect(screen.getByTestId("shared-vaults")).toHaveTextContent("editable");
    expect(screen.queryByText("Note")).not.toBeInTheDocument();
  });

  it("opens personal vault edit on FREE and keeps the stored name", () => {
    personalPopupSpy.mockClear();

    render(
      <MemoryRouter initialEntries={["/settings/vaults"]}>
        <LocaleProvider>
        <WorkspaceSettingsVaultsSection
          workspaceId="w1"
          workspace={freeWorkspace}
          vaults={[personalVault]}
          t={t}
          resourcePermissions={{ get: 1, post: 0, put: 1, delete: 0 }}
        />
      </LocaleProvider>
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
