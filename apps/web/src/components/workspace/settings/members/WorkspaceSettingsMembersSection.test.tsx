import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkspaceSettingsMembersSection from "./WorkspaceSettingsMembersSection";

const coreMock = vi.hoisted(() => ({
  listWorkspaceMembers: vi.fn(),
  listWorkspaceRoles: vi.fn(),
  listWorkspaceProfiles: vi.fn(),
}));

const enterpriseMembersMock = vi.hoisted(() => ({
  AdditionalMembersSection: null as (() => JSX.Element) | null,
}));

vi.mock("@okkey-enterprise/workspace-members", () => ({
  default: enterpriseMembersMock,
}));

vi.mock("../../../../auth/AuthVaultContext", () => ({
  useAuthenticatedCoreClient: () => coreMock,
  useAuthVault: () => ({ userId: "u1", vaultKey: null }),
}));

vi.mock("../../../../locale/LocaleContext", () => ({
  useLocale: () => ({ locale: "ru", t: (key: string) => key }),
}));

const t = (key: string) => {
  const map: Record<string, string> = {
    "web.workspaceSettings.members.title": "Участники пространства",
    "web.workspaceSettings.members.intro": "Intro",
    "web.workspaceSettings.members.learnMore": "Подробнее",
    "web.workspaceSettings.members.learnMoreUrl": "https://example.com",
    "web.workspaceSettings.members.loading": "Loading…",
    "web.workspaceSettings.members.searchPlaceholder": "Search…",
    "web.workspaceSettings.members.invite.action": "Invite",
    "web.workspaceSettings.members.additional.title": "Дополнительные участники",
    "web.workspaceSettings.members.additional.subtitle": "Invite teammates",
    "web.workspaceSettings.members.upsellNoteTitle": "Примечание",
    "web.workspaceSettings.members.upsellPrefix": "Feature unavailable. ",
    "web.workspaceSettings.members.upsellPlanLink": "Change plan",
    "web.workspaceSettings.members.upsellSuffix": " to unlock.",
    "web.workspaceSettings.members.roleUnknown": "Role",
  };
  return map[key] ?? key;
};

const ownerMember = {
  userId: "u1",
  email: "owner@example.com",
  firstName: "Owner",
  lastName: "User",
  publicKey: "pk",
  publicPqKey: null,
  roleId: "r1",
  roleBuiltinKey: "owner" as const,
  roleName: "Owner",
  status: "active" as const,
  invitationId: null,
  invitedAt: null,
  invitedBy: null,
  roleChangedAt: null,
  roleChangedBy: null,
  joinedAt: null,
  lastLoginAt: null,
};

describe("WorkspaceSettingsMembersSection", () => {
  beforeEach(() => {
    coreMock.listWorkspaceMembers.mockReset();
    coreMock.listWorkspaceRoles.mockReset();
    coreMock.listWorkspaceProfiles.mockReset();
    enterpriseMembersMock.AdditionalMembersSection = null;
  });

  it("renders header while loading", () => {
    coreMock.listWorkspaceMembers.mockReturnValue(new Promise(() => undefined));

    render(
      <MemoryRouter>
        <WorkspaceSettingsMembersSection workspaceId="w1" t={t} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Участники пространства")).toBeTruthy();
  });

  it("shows additional members upsell on FREE without enterprise module", async () => {
    coreMock.listWorkspaceMembers.mockResolvedValue({
      members: [ownerMember],
      actorPermissions: { members: { get: 2, post: 1, put: 1, delete: 1 } },
    });

    render(
      <MemoryRouter>
        <WorkspaceSettingsMembersSection
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
            createdAt: "",
            updatedAt: "",
          }}
          t={t}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Дополнительные участники")).toBeInTheDocument();
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Примечание")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Invite/i })).not.toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /owner@example.com/i })).not.toBeInTheDocument();
  });

  it("makes owner card clickable when enterprise members module is available", async () => {
    enterpriseMembersMock.AdditionalMembersSection = () => (
      <div data-testid="enterprise-members">Enterprise</div>
    );

    coreMock.listWorkspaceMembers.mockResolvedValue({
      members: [ownerMember],
      actorPermissions: { members: { get: 2, post: 1, put: 1, delete: 1 } },
    });

    render(
      <MemoryRouter>
        <WorkspaceSettingsMembersSection
          workspaceId="w1"
          workspace={{
            id: "w1",
            name: "WS",
            ownerId: "u1",
            planTier: "ENTERPRISE",
            deletedItemsRetentionDays: 30,
            allowedFileExtensions: [],
            maxFileSizeMb: 2,
            filesInItemsEnabled: true,
            createdAt: "",
            updatedAt: "",
          }}
          t={t}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("enterprise-members")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /owner@example.com/i })).toBeInTheDocument();
  });
});
