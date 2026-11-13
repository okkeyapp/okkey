import { render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanTier, Workspace } from "@okkey/types";

import type { WorkspacePlanListTileBadgeProps } from "../../workspace-features/plan-registry";
import WorkspacesListTile from "./WorkspacesListTile";

const planModuleMock = vi.hoisted(() => ({
  ListTileBadge: null as ComponentType<WorkspacePlanListTileBadgeProps> | null,
}));

vi.mock("@okkey-enterprise/workspace-plan", () => ({
  default: {
    PlanSection: null,
    get ListTileBadge() {
      return planModuleMock.ListTileBadge;
    },
  },
}));

vi.mock("../../auth/AuthVaultContext", () => ({
  useAuthVault: () => ({ accessToken: null, vaultKey: null }),
}));

vi.mock("../../hooks/useWorkspaceLogoUrl", () => ({
  useWorkspaceLogoUrl: () => ({ imageSrc: undefined, loading: false }),
}));

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "workspace-1",
    name: "Acme",
    ownerId: "user-1",
    planTier: "FREE",
    planCustomOverride: false,
    planFeatureOverrides: {},
    deletedItemsRetentionDays: 30,
    allowedFileExtensions: [],
    maxFileSizeMb: 2,
    filesInItemsEnabled: true,
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
    ...overrides,
  };
}

function renderTile(value: Workspace) {
  return render(
    <WorkspacesListTile workspace={value} description="Plan" onClick={() => undefined} />,
  );
}

function BadgeMark({ workspace: current }: WorkspacePlanListTileBadgeProps) {
  return <span data-testid="plan-list-badge">{current.id}</span>;
}

describe("WorkspacesListTile plan badge slot", () => {
  beforeEach(() => {
    planModuleMock.ListTileBadge = null;
  });

  it("renders no badge on FREE when the plan slot is empty", () => {
    renderTile(workspace({ planTier: "FREE" }));

    expect(screen.getByRole("button", { name: /Acme/ })).toBeInTheDocument();
    expect(screen.queryByTestId("plan-list-badge")).not.toBeInTheDocument();
  });

  it("renders no badge on a paid tier when the plan slot is empty", () => {
    renderTile(workspace({ planTier: "PREMIUM" satisfies PlanTier }));

    expect(screen.queryByTestId("plan-list-badge")).not.toBeInTheDocument();
  });

  it("mounts the plan slot badge when the workspace grants paidPlanBadge", () => {
    planModuleMock.ListTileBadge = BadgeMark;

    renderTile(workspace({ planTier: "PREMIUM" satisfies PlanTier }));

    expect(screen.getByTestId("plan-list-badge")).toHaveTextContent("workspace-1");
  });

  it("does not mount the plan slot badge on FREE", () => {
    planModuleMock.ListTileBadge = BadgeMark;

    renderTile(workspace({ planTier: "FREE" }));

    expect(screen.queryByTestId("plan-list-badge")).not.toBeInTheDocument();
  });

  it("does not mount the plan slot badge over a custom logo", () => {
    planModuleMock.ListTileBadge = BadgeMark;

    renderTile(
      workspace({
        planTier: "PREMIUM" satisfies PlanTier,
        logoVaultId: "vault-1",
        logoAttachmentId: "attachment-1",
      }),
    );

    expect(screen.queryByTestId("plan-list-badge")).not.toBeInTheDocument();
  });
});
