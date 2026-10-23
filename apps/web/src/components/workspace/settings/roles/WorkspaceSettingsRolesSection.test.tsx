import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanTier, WorkspaceResourcePermissionDto, WorkspaceRoleListItemDto } from "@okkey/types";

import { LocaleProvider } from "../../../../locale/LocaleContext";
import WorkspaceSettingsRolesSection from "./WorkspaceSettingsRolesSection";

const enterpriseModuleMock = vi.hoisted(() => ({
  EnterpriseRolesSection: null as ComponentType<unknown> | null,
  BuiltInRoleCardPopup: null as ComponentType<unknown> | null,
}));

const builtInRoles: WorkspaceRoleListItemDto[] = [
  { id: "1", kind: "builtin", builtin_id: "owner", name: "Owner", description: "", member_count: 1 },
  { id: "2", kind: "builtin", builtin_id: "admin", name: "Admin", description: "", member_count: 0 },
  { id: "3", kind: "builtin", builtin_id: "user", name: "User", description: "", member_count: 0 },
];

const coreMock = vi.hoisted(() => ({
  listWorkspaceRoles: vi.fn<(workspaceId: string) => Promise<{ roles: WorkspaceRoleListItemDto[] }>>(),
  deleteWorkspaceRole: vi.fn(async (_workspaceId: string, _roleId: string) => ({ ok: true as const })),
}));

const reauthMock = vi.hoisted(() => ({
  requestZoneUnlock: vi.fn(async () => true),
}));

vi.mock("../../../../auth/SectionReauthContext", () => ({
  useSectionReauth: () => reauthMock,
}));

vi.mock("@okkey-enterprise/workspace-roles", () => ({
  default: {
    get EnterpriseRolesSection() {
      return enterpriseModuleMock.EnterpriseRolesSection;
    },
    get BuiltInRoleCardPopup() {
      return enterpriseModuleMock.BuiltInRoleCardPopup;
    },
  },
}));

vi.mock("../../../../auth/AuthVaultContext", () => ({
  useAuthenticatedCoreClient: () => coreMock,
  useAuthVault: () => ({ userId: "user-1" }),
}));

beforeEach(() => {
  coreMock.listWorkspaceRoles.mockReset();
  coreMock.listWorkspaceRoles.mockImplementation(async () => ({ roles: builtInRoles }));
  coreMock.deleteWorkspaceRole.mockClear();
  reauthMock.requestZoneUnlock.mockClear();
});

function renderRolesSection(
  planTier: PlanTier = "FREE",
  resourcePermissions: WorkspaceResourcePermissionDto | null = null,
  planOptions?: {
    planCustomOverride?: boolean;
    planFeatureOverrides?: Record<string, boolean>;
  },
) {
  return render(
    <MemoryRouter>
      <LocaleProvider>
        <WorkspaceSettingsRolesSection
        workspaceId="ws-1"
        resourcePermissions={resourcePermissions}
        workspace={{
          id: "ws-1",
          name: "Test",
          ownerId: "user-1",
          planTier,
          planCustomOverride: planOptions?.planCustomOverride ?? false,
          planFeatureOverrides: planOptions?.planFeatureOverrides ?? {},
          deletedItemsRetentionDays: 30,
          allowedFileExtensions: ["jpg", "png", "pdf", "zip", "rar"],
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
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }}
        t={(key, values) => {
          if (key === "web.workspaceSettings.roles.memberCount" && values?.count !== undefined) {
            return `${values.count} members`;
          }
          const labels: Record<string, string> = {
            "web.workspaceSettings.sections.roles": "Roles",
            "web.workspaceSettings.roles.intro": "Roles intro",
            "web.workspaceSettings.roles.learnMore": "Learn more",
            "web.workspaceSettings.roles.learnMoreUrl": "https://example.com",
            "web.workspaceSettings.roles.builtIn.title": "Built-in roles",
            "web.workspaceSettings.roles.builtIn.subtitle": "Built-in roles are read-only",
            "web.workspaceSettings.roles.builtIn.owner": "Owner",
            "web.workspaceSettings.roles.builtIn.admin": "Admin",
            "web.workspaceSettings.roles.builtIn.user": "User",
            "web.workspaceSettings.roles.builtIn.ownerDescription": "Unique permissions",
            "web.workspaceSettings.roles.builtIn.adminDescription": "Full permissions",
            "web.workspaceSettings.roles.builtIn.userDescription": "No settings access",
            "web.workspaceSettings.roles.custom.title": "Custom roles",
            "web.workspaceSettings.roles.custom.subtitle": "Fully customizable roles",
            "web.workspaceSettings.roles.custom.create": "Create",
            "web.workspaceSettings.roles.upsellNoteTitle": "Note",
            "web.workspaceSettings.roles.upsellPrefix": "This feature is not available on your plan. ",
            "web.workspaceSettings.roles.upsellPlanLink": "Change your plan",
            "web.workspaceSettings.roles.upsellSuffix": " to unlock Custom roles.",
            "web.workspaceSettings.roles.enterpriseLoaded": "Enterprise roles loaded",
            "web.workspaceSettings.roles.actions.deleteRole": "Delete role",
            "web.deleteRoleConfirmPopup.title": "Delete role?",
            "web.deleteRoleConfirmPopup.description": "Members move to User",
            "web.deleteRoleConfirmPopup.delete": "Confirm delete",
            "web.newItemPopup.cancel": "Cancel",
          };
          return labels[key] ?? key;
        }}
      />
      </LocaleProvider>
    </MemoryRouter>,
  );
}

describe("WorkspaceSettingsRolesSection", () => {
  it("renders built-in roles and FREE upsell when custom roles are unavailable", async () => {
    enterpriseModuleMock.EnterpriseRolesSection = null;
    enterpriseModuleMock.BuiltInRoleCardPopup = null;
    renderRolesSection("FREE");

    expect(screen.getByRole("heading", { name: "Roles" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Built-in roles")).toBeInTheDocument();
    });
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change your plan" })).toHaveAttribute("href", "/settings/plan");
  });

  it("makes built-in roles clickable on FREE when enterprise popups are loaded", async () => {
    function BuiltInPopupStub() {
      return <p>Built-in role popup</p>;
    }

    enterpriseModuleMock.EnterpriseRolesSection = null;
    enterpriseModuleMock.BuiltInRoleCardPopup = BuiltInPopupStub;
    renderRolesSection("FREE");

    await waitFor(() => {
      expect(screen.getByText("Built-in roles")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Owner/i })).toBeInTheDocument();
  });

  it("renders enterprise custom roles section when module is loaded on paid plan", () => {
    function EnterpriseStub() {
      return <p>Enterprise roles loaded</p>;
    }

    enterpriseModuleMock.EnterpriseRolesSection = EnterpriseStub;
    enterpriseModuleMock.BuiltInRoleCardPopup = null;
    renderRolesSection("ENTERPRISE");

    expect(screen.getByText("Enterprise roles loaded")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Change your plan" })).not.toBeInTheDocument();
  });

  it("mounts enterprise section read-only with upsell on FREE when module is loaded", () => {
    function EnterpriseStub({
      readOnly,
      emptyFallback,
    }: {
      readOnly?: boolean;
      emptyFallback?: ReactNode;
    }) {
      return (
        <>
          <p>{readOnly ? "Enterprise roles read-only" : "Enterprise roles editable"}</p>
          {readOnly ? emptyFallback : null}
        </>
      );
    }

    enterpriseModuleMock.EnterpriseRolesSection = EnterpriseStub as ComponentType<unknown>;
    enterpriseModuleMock.BuiltInRoleCardPopup = null;
    renderRolesSection("FREE");

    expect(screen.getByText("Enterprise roles read-only")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change your plan" })).toHaveAttribute("href", "/settings/plan");
  });

  it("mounts enterprise section read-only when plan override forbids customWorkspaceRoles", () => {
    function EnterpriseStub({
      readOnly,
      emptyFallback,
    }: {
      readOnly?: boolean;
      emptyFallback?: ReactNode;
    }) {
      return (
        <>
          <p>{readOnly ? "Enterprise roles read-only" : "Enterprise roles editable"}</p>
          {readOnly ? emptyFallback : null}
        </>
      );
    }

    enterpriseModuleMock.EnterpriseRolesSection = EnterpriseStub as ComponentType<unknown>;
    enterpriseModuleMock.BuiltInRoleCardPopup = null;
    renderRolesSection("ENTERPRISE", null, {
      planCustomOverride: true,
      planFeatureOverrides: { customWorkspaceRoles: false },
    });

    expect(screen.getByText("Enterprise roles read-only")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change your plan" })).toHaveAttribute("href", "/settings/plan");
  });

  it("FREE + stub: custom role from API appears and delete callable", async () => {
    enterpriseModuleMock.EnterpriseRolesSection = null;
    enterpriseModuleMock.BuiltInRoleCardPopup = null;
    coreMock.listWorkspaceRoles.mockImplementation(async () => ({
      roles: [
        ...builtInRoles,
        {
          id: "9",
          kind: "custom",
          name: "Auditors",
          description: "Legacy custom role",
          member_count: 2,
          created_by: "user-2",
        },
      ],
    }));
    renderRolesSection("FREE", { get: 1, post: 1, put: 1, delete: 1 });

    expect(await screen.findByText("Auditors")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change your plan" })).toHaveAttribute("href", "/settings/plan");
    expect(screen.queryByRole("button", { name: "Create" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete role" }));
    expect(screen.getAllByText("Delete role?").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => {
      expect(coreMock.deleteWorkspaceRole).toHaveBeenCalledWith("ws-1", "9");
    });
    expect(reauthMock.requestZoneUnlock).toHaveBeenCalledWith("deletion", { persist: false });
    await waitFor(() => {
      expect(screen.queryByText("Auditors")).not.toBeInTheDocument();
    });
  });

  it("FREE + stub: hides delete for custom role without delete permission", async () => {
    enterpriseModuleMock.EnterpriseRolesSection = null;
    enterpriseModuleMock.BuiltInRoleCardPopup = null;
    coreMock.listWorkspaceRoles.mockImplementation(async () => ({
      roles: [
        ...builtInRoles,
        { id: "9", kind: "custom", name: "Auditors", description: "", member_count: 0, created_by: "user-2" },
      ],
    }));
    renderRolesSection("FREE", { get: 1, post: 0, put: 0, delete: 2 });

    expect(await screen.findByText("Auditors")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete role" })).not.toBeInTheDocument();
  });
});
