import { render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "../../../../locale/LocaleContext";
import WorkspaceSettingsRolesSection from "./WorkspaceSettingsRolesSection";

const enterpriseModuleMock = vi.hoisted(() => ({
  EnterpriseRolesSection: null as ComponentType<unknown> | null,
}));

const coreMock = vi.hoisted(() => ({
  listWorkspaceRoles: vi.fn(async () => ({
    roles: [
      { id: "1", kind: "builtin" as const, builtin_id: "owner" as const, name: "Owner", description: "", member_count: 1 },
      { id: "2", kind: "builtin" as const, builtin_id: "admin" as const, name: "Admin", description: "", member_count: 0 },
      { id: "3", kind: "builtin" as const, builtin_id: "user" as const, name: "User", description: "", member_count: 0 },
    ],
  })),
}));

vi.mock("@okkey-enterprise/workspace-roles", () => ({
  default: {
    get EnterpriseRolesSection() {
      return enterpriseModuleMock.EnterpriseRolesSection;
    },
  },
}));

vi.mock("../../../../auth/AuthVaultContext", () => ({
  useAuthenticatedCoreClient: () => coreMock,
}));

function renderRolesSection(planTier = "FREE") {
  return render(
    <MemoryRouter>
      <LocaleProvider>
        <WorkspaceSettingsRolesSection
        workspaceId="ws-1"
        workspace={{
          id: "ws-1",
          name: "Test",
          ownerId: "user-1",
          planTier,
          deletedItemsRetentionDays: 30,
          allowedFileExtensions: ["jpg", "png", "pdf", "zip", "rar"],
          maxFileSizeMb: 2,
          filesInItemsEnabled: true,
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

  it("renders enterprise custom roles section when module is loaded on paid plan", () => {
    function EnterpriseStub() {
      return <p>Enterprise roles loaded</p>;
    }

    enterpriseModuleMock.EnterpriseRolesSection = EnterpriseStub;
    renderRolesSection("TEAM");

    expect(screen.getByText("Enterprise roles loaded")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Change your plan" })).not.toBeInTheDocument();
  });
});
