import { render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "../../../../locale/LocaleContext";
import WorkspaceSettingsProfilesSection from "./WorkspaceSettingsProfilesSection";

const enterpriseModuleMock = vi.hoisted(() => ({
  EnterpriseProfilesSection: null as ComponentType<unknown> | null,
  BuiltInProfileCardPopup: null as ComponentType<unknown> | null,
}));

const coreMock = vi.hoisted(() => ({
  listWorkspaceProfiles: vi.fn(async () => ({
    profiles: [
      {
        id: "1",
        kind: "builtin" as const,
        builtin_id: "extended" as const,
        name: "Extended",
        description: "",
        application_count: 2,
      },
      {
        id: "2",
        kind: "builtin" as const,
        builtin_id: "simple" as const,
        name: "Simple",
        description: "",
        application_count: 0,
      },
    ],
  })),
}));

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
}));

function renderProfilesSection(planTier: "FREE" | "ENTERPRISE" = "FREE") {
  return render(
    <MemoryRouter>
      <LocaleProvider>
        <WorkspaceSettingsProfilesSection
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
                "Permission to read records and save to personal vault",
              "web.workspaceSettings.profiles.custom.title": "Custom profiles",
              "web.workspaceSettings.profiles.custom.subtitle": "Fully customizable profiles",
              "web.workspaceSettings.profiles.custom.create": "Create",
              "web.workspaceSettings.profiles.upsellNoteTitle": "Note",
              "web.workspaceSettings.profiles.upsellPrefix":
                "This feature is not available on your plan. ",
              "web.workspaceSettings.profiles.upsellPlanLink": "Change your plan",
              "web.workspaceSettings.profiles.upsellSuffix": " to unlock Custom profiles.",
              "web.workspaceSettings.profiles.retry": "Retry",
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

  it("keeps built-in profiles non-clickable on FREE even when enterprise popups are loaded", async () => {
    function BuiltInPopupStub() {
      return <p>Built-in profile popup</p>;
    }

    enterpriseModuleMock.EnterpriseProfilesSection = null;
    enterpriseModuleMock.BuiltInProfileCardPopup = BuiltInPopupStub;
    renderProfilesSection("FREE");

    await waitFor(() => {
      expect(screen.getByText("Built-in profiles")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Extended/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Built-in profile popup")).not.toBeInTheDocument();
  });
});
