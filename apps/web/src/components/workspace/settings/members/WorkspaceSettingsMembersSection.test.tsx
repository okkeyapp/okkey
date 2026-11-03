import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceMemberDto } from "@okkey/types";

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

const enterpriseMembersMock = vi.hoisted(() => ({
  AdditionalMembersSection: null as
    | ((props: { readOnly?: boolean; emptyFallback?: ReactNode }) => JSX.Element)
    | null,
}));

vi.mock("@okkey-enterprise/workspace-members", () => ({
  default: enterpriseMembersMock,
  tryCompletePendingVaultWraps: vi.fn(),
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

const activeMember: WorkspaceMemberDto = {
  ...ownerMember,
  userId: "1000000002",
  email: "teammate@example.com",
  firstName: "Team",
  lastName: "Mate",
  roleId: "r3",
  roleBuiltinKey: "user",
  roleName: "User",
  invitedBy: { userId: "u1", email: "owner@example.com", firstName: "Owner", lastName: "User" },
};

const pendingInvitee: WorkspaceMemberDto = {
  ...ownerMember,
  userId: null,
  email: "invitee@example.com",
  firstName: null,
  lastName: null,
  publicKey: "",
  roleId: "r3",
  roleBuiltinKey: "user",
  roleName: "User",
  status: "pending",
  invitationId: "2000000001",
  invitedAt: "2026-01-02T00:00:00.000Z",
  invitedBy: { userId: "u1", email: "owner@example.com", firstName: "Owner", lastName: "User" },
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
};

describe("WorkspaceSettingsMembersSection", () => {
  beforeEach(() => {
    coreMock.listWorkspaceMembers.mockReset();
    coreMock.listWorkspaceRoles.mockReset();
    coreMock.listWorkspaceProfiles.mockReset();
    coreMock.revokeWorkspaceInvitation.mockReset();
    coreMock.deleteWorkspaceMember.mockReset();
    reauthMock.requestZoneUnlock.mockClear();
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
          t={t}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("enterprise-members")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /owner@example.com/i })).toBeInTheDocument();
  });

  it("mounts enterprise members read-only with upsell on FREE when module is loaded", async () => {
    enterpriseMembersMock.AdditionalMembersSection = ({ readOnly, emptyFallback }) => (
      <div data-testid="enterprise-members">
        {readOnly ? "read-only" : "editable"}
        {readOnly ? emptyFallback : null}
      </div>
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
          t={t}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("enterprise-members")).toHaveTextContent("read-only");
    });
    expect(screen.getByText("Примечание")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /owner@example.com/i })).toBeInTheDocument();
  });

  it("mounts enterprise members read-only when plan override forbids additionalWorkspaceMembers", async () => {
    enterpriseMembersMock.AdditionalMembersSection = ({ readOnly, emptyFallback }) => (
      <div data-testid="enterprise-members">
        {readOnly ? "read-only" : "editable"}
        {readOnly ? emptyFallback : null}
      </div>
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
      expect(screen.getByTestId("enterprise-members")).toHaveTextContent("read-only");
    });
    expect(screen.getByText("Примечание")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /owner@example.com/i })).toBeInTheDocument();
  });

  it("FREE + stub: invitee/pending member visible and revocable", async () => {
    coreMock.listWorkspaceMembers.mockResolvedValue({
      members: [ownerMember, activeMember, pendingInvitee],
      actorPermissions: { members: { get: 1, post: 1, put: 1, delete: 1 } },
    });
    coreMock.revokeWorkspaceInvitation.mockResolvedValue({ revoked: true });

    render(
      <MemoryRouter>
        <WorkspaceSettingsMembersSection workspaceId="w1" workspace={freeWorkspace} t={t} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("invitee@example.com")).toBeInTheDocument();
    expect(screen.getByText("teammate@example.com")).toBeInTheDocument();
    expect(screen.getByText("Примечание")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove member" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revoke invite" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => {
      expect(coreMock.revokeWorkspaceInvitation).toHaveBeenCalledWith("w1", "2000000001");
    });
    expect(reauthMock.requestZoneUnlock).toHaveBeenCalledWith("deletion", { persist: false });
    expect(coreMock.deleteWorkspaceMember).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(coreMock.listWorkspaceMembers).toHaveBeenCalledTimes(2);
    });
  });

  it("FREE + stub: removes an active additional member", async () => {
    coreMock.listWorkspaceMembers.mockResolvedValue({
      members: [ownerMember, activeMember],
      actorPermissions: { members: { get: 1, post: 1, put: 1, delete: 1 } },
    });
    coreMock.deleteWorkspaceMember.mockResolvedValue({ deleted: true });

    render(
      <MemoryRouter>
        <WorkspaceSettingsMembersSection workspaceId="w1" workspace={freeWorkspace} t={t} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Remove member" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => {
      expect(coreMock.deleteWorkspaceMember).toHaveBeenCalledWith("w1", "1000000002");
    });
  });

  it("FREE + stub: hides delete when actor lacks members delete permission", async () => {
    coreMock.listWorkspaceMembers.mockResolvedValue({
      members: [ownerMember, pendingInvitee],
      actorPermissions: { members: { get: 1, post: 0, put: 0, delete: 0 } },
    });

    render(
      <MemoryRouter>
        <WorkspaceSettingsMembersSection workspaceId="w1" workspace={freeWorkspace} t={t} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("invitee@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke invite" })).not.toBeInTheDocument();
  });
});
