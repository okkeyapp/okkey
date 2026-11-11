import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { publicDocsUrl } from "../../../../docs/publicDocsUrl";
import WorkspaceSettingsMembersSection from "./WorkspaceSettingsMembersSection";

const coreMock = vi.hoisted(() => ({
  listWorkspaceMembers: vi.fn(),
  listWorkspaceRoles: vi.fn(),
  listWorkspaceProfiles: vi.fn(),
  revokeWorkspaceInvitation: vi.fn(),
  deleteWorkspaceMember: vi.fn(),
}));

const reauthMock = vi.hoisted(() => ({
  requestZoneUnlock: vi.fn(async () => true),
}));

vi.mock("../../../../auth/SectionReauthContext", () => ({
  useSectionReauth: () => reauthMock,
}));

vi.mock("./MemberCardPopup", () => ({
  default: () => null,
}));

vi.mock("./InviteMembersPopup", () => ({
  default: () => null,
}));

vi.mock("./AdditionalMembersSection", () => ({
  default: ({ readOnly, emptyFallback }: { readOnly?: boolean; emptyFallback?: ReactNode }) => (
    <div data-testid="members-section">
      {readOnly ? "read-only" : "editable"}
      {readOnly ? emptyFallback : null}
    </div>
  ),
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
    "web.workspaceSettings.members.deleteConfirm.deleteInvite": "Revoke invite",
    "web.workspaceSettings.members.deleteConfirm.deleteMember": "Remove member",
    "web.workspaceSettings.members.deleteConfirm.delete": "Confirm delete",
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

const freeWorkspace = {
  id: "w1",
  name: "WS",
  ownerId: "u1",
  planTier: "FREE" as const,
  planCustomOverride: false,
  planFeatureOverrides: {},
  deletedItemsRetentionDays: 30,
  allowedFileExtensions: [],
  maxFileSizeMb: 2,
  filesInItemsEnabled: true,
  capsulePolicies: {
    allowMode: "all" as const,
    allowMemberIds: [],
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

describe("WorkspaceSettingsMembersSection", () => {
  beforeEach(() => {
    coreMock.listWorkspaceMembers.mockReset();
    coreMock.listWorkspaceRoles.mockReset();
    coreMock.listWorkspaceProfiles.mockReset();
    coreMock.revokeWorkspaceInvitation.mockReset();
    coreMock.deleteWorkspaceMember.mockReset();
    reauthMock.requestZoneUnlock.mockClear();
  });

  it("renders header while loading", () => {
    coreMock.listWorkspaceMembers.mockReturnValue(new Promise(() => undefined));

    render(
      <MemoryRouter>
        <WorkspaceSettingsMembersSection workspaceId="w1" t={t} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Участники пространства")).toBeTruthy();
    const learnMore = screen.getByRole("link", { name: "Подробнее" });
    expect(learnMore).toHaveAttribute("href", publicDocsUrl("members", "ru"));
    expect(learnMore).toHaveAttribute("target", "_blank");
    expect(learnMore.getAttribute("rel")).toContain("noopener");
  });

  it("mounts additional members as editable on FREE", async () => {
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
            planCustomOverride: false,
            planFeatureOverrides: {},
            deletedItemsRetentionDays: 30,
            allowedFileExtensions: [],
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
            createdAt: "",
            updatedAt: "",
          }}
          t={t}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("members-section")).toHaveTextContent("editable");
    });
    expect(screen.queryByText("Примечание")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /owner@example.com/i })).toBeInTheDocument();
  });

  it("makes the owner card open the member popup", async () => {
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
            planCustomOverride: false,
            planFeatureOverrides: {},
            deletedItemsRetentionDays: 30,
            allowedFileExtensions: [],
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
            createdAt: "",
            updatedAt: "",
          }}
          t={t}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("members-section")).toHaveTextContent("editable");
    });
    expect(screen.getByRole("button", { name: /owner@example.com/i })).toBeInTheDocument();
  });

  it("keeps additional members editable on FREE", async () => {
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
            planCustomOverride: false,
            planFeatureOverrides: {},
            deletedItemsRetentionDays: 30,
            allowedFileExtensions: [],
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
            createdAt: "",
            updatedAt: "",
          }}
          t={t}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("members-section")).toHaveTextContent("editable");
    });
    expect(screen.queryByText("Примечание")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /owner@example.com/i })).toBeInTheDocument();
  });

  it("mounts additional members read-only when plan override forbids them", async () => {
    coreMock.listWorkspaceMembers.mockResolvedValue({
      members: [ownerMember],
      actorPermissions: { members: { get: 2, post: 1, put: 1, delete: 1 } },
    });

    render(
      <MemoryRouter>
        <WorkspaceSettingsMembersSection
          workspaceId="w1"
          workspace={{
            ...freeWorkspace,
            planTier: "ENTERPRISE",
            planCustomOverride: true,
            planFeatureOverrides: { additionalWorkspaceMembers: false },
          }}
          t={t}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("members-section")).toHaveTextContent("read-only");
    });
    expect(screen.getByText("Примечание")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /owner@example.com/i })).toBeInTheDocument();
  });
});
