import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "../../../../locale/LocaleContext";
import WorkspaceSettingsProfilesSection from "./WorkspaceSettingsProfilesSection";
import type { PlanTier, WorkspaceProfileListItemDto, WorkspaceResourcePermissionDto } from "@okkey/types";

const enterpriseModuleMock = vi.hoisted(() => ({
  EnterpriseProfilesSection: null as ComponentType<unknown> | null,
  BuiltInProfileCardPopup: null as ComponentType<unknown> | null,
}));

const builtInProfiles: WorkspaceProfileListItemDto[] = [
  { id: "1", kind: "builtin", builtin_id: "extended", name: "Extended", description: "", application_count: 2 },
  { id: "2", kind: "builtin", builtin_id: "simple", name: "Simple", description: "", application_count: 0 },
];

const coreMock = vi.hoisted(() => ({
  listWorkspaceProfiles: vi.fn<(workspaceId: string) => Promise<{ profiles: WorkspaceProfileListItemDto[] }>>(),
  deleteWorkspaceProfile: vi.fn(async (_workspaceId: string, _profileId: string) => ({ ok: true as const })),
}));

const reauthMock = vi.hoisted(() => ({
  requestZoneUnlock: vi.fn(async () => true),
}));

vi.mock("../../../../auth/SectionReauthContext", () => ({
  useSectionReauth: () => reauthMock,
}));

beforeEach(() => {
  coreMock.listWorkspaceProfiles.mockReset();
  coreMock.listWorkspaceProfiles.mockImplementation(async () => ({ profiles: builtInProfiles }));
  coreMock.deleteWorkspaceProfile.mockClear();
  reauthMock.requestZoneUnlock.mockClear();
});

vi.mock("@okkey-enterprise/workspace-profiles", () => ({
  default: {
    get EnterpriseProfilesSection() {
      return enterpriseModuleMock.EnterpriseProfilesSection;
    },
    get BuiltInProfileCardPopup() {
      return enterpriseModuleMock.BuiltInProfileCardPopup;
    },
  },
}));

vi.mock("../../../../auth/AuthVaultContext", () => ({
  useAuthenticatedCoreClient: () => coreMock,
  useAuthVault: () => ({ userId: "user-1" }),
}));

function renderProfilesSection(
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
        <WorkspaceSettingsProfilesSection
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
              allowedCapsuleTypes: ["text", "file", "item"] as const,
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
            if (key === "web.workspaceSettings.profiles.applicationCount" && values?.count !== undefined) {
              return `${values.count} applications`;
            }
            const labels: Record<string, string> = {
              "web.workspaceSettings.sections.profiles": "Profiles",
              "web.workspaceSettings.sections.roles": "Roles",
              "web.workspaceSettings.profiles.intro": "Profiles intro",
              "web.workspaceSettings.profiles.learnMore": "Learn more",
              "web.workspaceSettings.profiles.learnMoreUrl": "https://example.com",
              "web.workspaceSettings.profiles.builtIn.title": "Built-in profiles",
              "web.workspaceSettings.profiles.builtIn.subtitle": "Built-in profiles are read-only",
              "web.workspaceSettings.profiles.builtIn.extended": "Extended",
              "web.workspaceSettings.profiles.builtIn.simple": "Simple",
              "web.workspaceSettings.profiles.builtIn.extendedDescription":
                "Automatically applied to owners and admins",
              "web.workspaceSettings.profiles.builtIn.simpleDescription":
                "Permission to read records, favorites, capsules, and copy records",
              "web.workspaceSettings.profiles.custom.title": "Custom profiles",
              "web.workspaceSettings.profiles.custom.subtitle": "Fully customizable profiles",
              "web.workspaceSettings.profiles.custom.create": "Create",
              "web.workspaceSettings.profiles.upsellNoteTitle": "Note",
              "web.workspaceSettings.profiles.upsellPrefix":
                "This feature is not available on your plan. ",
              "web.workspaceSettings.profiles.upsellPlanLink": "Change your plan",
              "web.workspaceSettings.profiles.upsellSuffix": " to unlock Custom profiles.",
              "web.workspaceSettings.profiles.retry": "Retry",
              "web.workspaceSettings.profiles.actions.deleteProfile": "Delete profile",
              "web.deleteProfileConfirmPopup.title": "Delete profile?",
              "web.deleteProfileConfirmPopup.description": "Vault access using it is cleared",
              "web.deleteProfileConfirmPopup.delete": "Confirm delete",
              "web.newItemPopup.cancel": "Cancel",
            };
            return labels[key] ?? key;
          }}
        />
      </LocaleProvider>
    </MemoryRouter>,
  );
}

describe("WorkspaceSettingsProfilesSection", () => {
  it("renders built-in profiles and FREE upsell", async () => {
    enterpriseModuleMock.EnterpriseProfilesSection = null;
    enterpriseModuleMock.BuiltInProfileCardPopup = null;
    renderProfilesSection("FREE");
    await waitFor(() => {
      expect(screen.getByText("Built-in profiles")).toBeTruthy();
    });
    expect(screen.getByText("Extended")).toBeTruthy();
    expect(screen.getByText("Simple")).toBeTruthy();
    expect(screen.getByText("Custom profiles")).toBeTruthy();
    expect(screen.getByText("Change your plan")).toBeTruthy();
  });

  it("makes built-in profiles clickable on FREE when enterprise popups are loaded", async () => {
    function BuiltInPopupStub() {
      return <p>Built-in profile popup</p>;
    }

    enterpriseModuleMock.EnterpriseProfilesSection = null;
    enterpriseModuleMock.BuiltInProfileCardPopup = BuiltInPopupStub;
    renderProfilesSection("FREE");

    await waitFor(() => {
      expect(screen.getByText("Built-in profiles")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Extended/i })).toBeInTheDocument();
  });

  it("mounts enterprise section read-only with upsell on FREE when module is loaded", async () => {
    function EnterpriseStub({
      readOnly,
      emptyFallback,
    }: {
      readOnly?: boolean;
      emptyFallback?: ReactNode;
    }) {
      return (
        <>
          <p>{readOnly ? "Enterprise profiles read-only" : "Enterprise profiles editable"}</p>
          {readOnly ? emptyFallback : null}
        </>
      );
    }

    enterpriseModuleMock.EnterpriseProfilesSection = EnterpriseStub as ComponentType<unknown>;
    enterpriseModuleMock.BuiltInProfileCardPopup = null;
    renderProfilesSection("FREE");

    await waitFor(() => {
      expect(screen.getByText("Built-in profiles")).toBeInTheDocument();
    });
    expect(screen.getByText("Enterprise profiles read-only")).toBeInTheDocument();
    expect(screen.getByText("Change your plan")).toBeInTheDocument();
  });

  it("mounts enterprise section read-only when plan override forbids customWorkspaceProfiles", async () => {
    function EnterpriseStub({
      readOnly,
      emptyFallback,
    }: {
      readOnly?: boolean;
      emptyFallback?: ReactNode;
    }) {
      return (
        <>
          <p>{readOnly ? "Enterprise profiles read-only" : "Enterprise profiles editable"}</p>
          {readOnly ? emptyFallback : null}
        </>
      );
    }

    enterpriseModuleMock.EnterpriseProfilesSection = EnterpriseStub as ComponentType<unknown>;
    enterpriseModuleMock.BuiltInProfileCardPopup = null;
    renderProfilesSection("ENTERPRISE", null, {
      planCustomOverride: true,
      planFeatureOverrides: { customWorkspaceProfiles: false },
    });

    await waitFor(() => {
      expect(screen.getByText("Built-in profiles")).toBeInTheDocument();
    });
    expect(screen.getByText("Enterprise profiles read-only")).toBeInTheDocument();
    expect(screen.getByText("Change your plan")).toBeInTheDocument();
  });

  it("FREE + stub: custom profile from API appears and delete callable", async () => {
    enterpriseModuleMock.EnterpriseProfilesSection = null;
    enterpriseModuleMock.BuiltInProfileCardPopup = null;
    coreMock.listWorkspaceProfiles.mockImplementation(async () => ({
      profiles: [
        ...builtInProfiles,
        {
          id: "9",
          kind: "custom",
          name: "Read only legacy",
          description: "",
          application_count: 3,
          created_by: "user-1",
        },
      ],
    }));
    renderProfilesSection("FREE", { get: 1, post: 1, put: 1, delete: 2 });

    expect(await screen.findByText("Read only legacy")).toBeInTheDocument();
    expect(screen.getByText("Change your plan")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete profile" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => {
      expect(coreMock.deleteWorkspaceProfile).toHaveBeenCalledWith("ws-1", "9");
    });
    await waitFor(() => {
      expect(screen.queryByText("Read only legacy")).not.toBeInTheDocument();
    });
  });
});
