import { DEFAULT_WORKSPACE_CAPSULE_POLICIES, type Workspace, type WorkspacePermissionsMatrixDto } from "@okkey/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkspaceSettingsPage from "./WorkspaceSettingsPage";
import { resetBackendEnterpriseModulesActiveForTests } from "../../../workspace/planEntitlements";

vi.mock("./WorkspaceSettingsMobileHeader", () => ({ default: () => null }));
vi.mock("../../../pages/workspace/WorkspaceForbiddenPage", () => ({ default: () => null }));
vi.mock("./WorkspaceSettingsGeneralSection", () => ({ default: () => null }));
vi.mock("./roles/WorkspaceSettingsRolesSection", () => ({ default: () => null }));
vi.mock("./profiles/WorkspaceSettingsProfilesSection", () => ({ default: () => null }));
vi.mock("./vaults/WorkspaceSettingsVaultsSection", () => ({ default: () => null }));
vi.mock("./members/WorkspaceSettingsMembersSection", () => ({ default: () => null }));

vi.mock("@okkey-enterprise/workspace-plan", () => ({
  default: {
    PlanSection: ({ planTier }: { planTier?: string | null }) => (
      <div data-testid="ee-plan-section">ee-plan:{planTier}</div>
    ),
  },
}));

vi.mock("../../../locale/LocaleContext", () => ({
  useLocale: () => ({
    locale: "en" as const,
    setLocale: () => undefined,
    t: (key: string) => key,
  }),
}));

vi.mock("../../../auth/AuthVaultContext", () => ({
  useAuthenticatedCoreClient: () => null,
}));

const billingPermissions: WorkspacePermissionsMatrixDto = {
  settings: { get: 0, post: 0, put: 0, delete: 0 },
  settings_items: { get: 0, post: 0, put: 0, delete: 0 },
  settings_capsules: { get: 0, post: 0, put: 0, delete: 0 },
  roles: { get: 0, post: 0, put: 0, delete: 0 },
  profiles: { get: 0, post: 0, put: 0, delete: 0 },
  members: { get: 0, post: 0, put: 0, delete: 0 },
  vaults: { get: 0, post: 0, put: 0, delete: 0 },
  billing: { get: 1, post: 0, put: 1, delete: 0 },
};

function workspace(planTier: Workspace["planTier"]): Workspace {
  return {
    id: "ws-1",
    name: "Acme",
    ownerId: "user-1",
    planTier,
    planCustomOverride: false,
    planFeatureOverrides: {},
    deletedItemsRetentionDays: 30,
    allowedFileExtensions: [],
    maxFileSizeMb: 2,
    filesInItemsEnabled: true,
    capsulePolicies: DEFAULT_WORKSPACE_CAPSULE_POLICIES,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function renderPlanPage(planTier: Workspace["planTier"]) {
  return render(
    <MemoryRouter initialEntries={["/settings/plan"]}>
      <Routes>
        <Route
          path="/settings/:sectionSlug"
          element={
            <WorkspaceSettingsPage
              workspaceId="ws-1"
              workspace={workspace(planTier)}
              vaults={[]}
              workspacePermissions={billingPermissions}
              workspacePermissionsReady
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const licenseCtaName = "web.workspaceSettings.plan.selfHosted.requestCta";

describe("workspace settings plan section", () => {
  beforeEach(() => {
    resetBackendEnterpriseModulesActiveForTests();
  });

  it("EE + FREE plan_tier shows the enterprise plan section", () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "true");

    renderPlanPage("FREE");

    expect(screen.getByTestId("ee-plan-section")).toHaveTextContent("ee-plan:ENTERPRISE");
    expect(screen.queryByRole("button", { name: licenseCtaName })).not.toBeInTheDocument();
  });

  it("EE + paid keeps the enterprise plan section", () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "true");

    renderPlanPage("ENTERPRISE");

    expect(screen.getByTestId("ee-plan-section")).toHaveTextContent("ee-plan:ENTERPRISE");
    expect(screen.queryByRole("button", { name: licenseCtaName })).not.toBeInTheDocument();
  });

  it("non-EE + FREE shows the license request form and opens it", async () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "self_hosted");
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "false");

    renderPlanPage("FREE");

    expect(screen.queryByTestId("ee-plan-section")).not.toBeInTheDocument();
    const cta = await screen.findByRole("button", { name: licenseCtaName });
    await waitFor(() => {
      expect(cta).toBeEnabled();
    });
    expect(
      screen.queryByText("web.workspaceSettings.plan.selfHosted.requestTitle"),
    ).not.toBeInTheDocument();
    fireEvent.click(cta);
    expect(
      screen.getAllByText("web.workspaceSettings.plan.selfHosted.requestTitle").length,
    ).toBeGreaterThan(0);
  });

  it("SaaS FREE keeps the catalog plan section", () => {
    vi.stubEnv("VITE_DEPLOYMENT_MODE", "saas");
    vi.stubEnv("VITE_ENTERPRISE_MODULES_ACTIVE", "true");

    renderPlanPage("FREE");

    expect(screen.getByTestId("ee-plan-section")).toHaveTextContent("ee-plan:FREE");
    expect(screen.queryByRole("button", { name: licenseCtaName })).not.toBeInTheDocument();
  });
});
