import type {
  Workspace,
  WorkspaceMemberDto,
  WorkspaceMembersPermissionCellDto,
  WorkspaceProfileSummary,
  WorkspaceRoleSummary,
} from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { Button, Input } from "@okkey/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useAuthVault, useAuthenticatedCoreClient } from "../../../../auth/AuthVaultContext";
import { useLocale } from "../../../../locale/LocaleContext";
import { runSaveWithToast } from "../../../../lib/saveWithToast";
import {
  buildPopupQueryValue,
  EDIT_MEMBER_POPUP_ID,
  INVITE_MEMBERS_POPUP_ID,
  parsePopupQueryValue,
  popupQuerySearch,
  POPUP_QUERY_PARAM,
} from "../../../../routes/popupQuery";
import SettingsListCardSkeleton from "../SettingsListCardSkeleton";
import InviteMembersPopup from "./InviteMembersPopup";
import MemberCardPopup from "./MemberCardPopup";
import MembersListCard from "./MembersListCard";
import MembersSectionHeader from "./MembersSectionHeader";

type WorkspaceSettingsMembersSectionProps = {
  workspaceId: string;
  workspace?: Workspace;
  t: (messageKey: string, values?: WebMessageValues) => string;
};

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <path
        d="M3.33337 8H12.6667M8.00004 3.33337V12.6667"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const EMPTY_PERMISSIONS: WorkspaceMembersPermissionCellDto = {
  get: 0,
  post: 0,
  put: 0,
  delete: 0,
};

export default function WorkspaceSettingsMembersSection({
  workspaceId,
  workspace,
  t,
}: WorkspaceSettingsMembersSectionProps) {
  const core = useAuthenticatedCoreClient();
  const { userId, vaultKey } = useAuthVault();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberDto[]>([]);
  const [permissions, setPermissions] =
    useState<WorkspaceMembersPermissionCellDto>(EMPTY_PERMISSIONS);
  const [roles, setRoles] = useState<WorkspaceRoleSummary[]>([]);
  const [profiles, setProfiles] = useState<WorkspaceProfileSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const popupRaw = searchParams.get(POPUP_QUERY_PARAM);
  const parsedPopup = parsePopupQueryValue(popupRaw);
  const inviteOpen = parsedPopup?.popupId === INVITE_MEMBERS_POPUP_ID;
  const editMemberId =
    parsedPopup?.popupId === EDIT_MEMBER_POPUP_ID ? parsedPopup.menuItemId ?? null : null;

  const load = useCallback(async () => {
    if (!core) {
      return;
    }
    setError(null);
    try {
      const [membersResponse, rolesResponse, profilesResponse] = await Promise.all([
        core.listWorkspaceMembers(workspaceId),
        core.listWorkspaceRoles(workspaceId),
        core.listWorkspaceProfiles(workspaceId),
      ]);
      setMembers(membersResponse.members);
      setPermissions(membersResponse.actorPermissions?.members ?? EMPTY_PERMISSIONS);
      setRoles(
        rolesResponse.roles.map((role) => {
          const row = role as {
            id: string;
            name: string;
            description: string;
            kind: "builtin" | "custom";
            builtin_id?: "owner" | "admin" | "user";
            member_count: number;
          };
          return {
            id: row.id,
            name: row.name,
            description: row.description,
            kind: row.kind,
            builtinId: row.builtin_id,
            memberCount: row.member_count,
          };
        }),
      );
      setProfiles(
        profilesResponse.profiles.map((profile) => ({
          id: profile.id,
          name: profile.name,
          description: profile.description,
          kind: "builtin" as const,
          builtinId: profile.builtin_id,
          applicationCount: profile.application_count,
        })),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("web.toast.save.error"));
      setMembers([]);
      setPermissions(EMPTY_PERMISSIONS);
    } finally {
      setLoading(false);
    }
  }, [core, t, workspaceId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  function openPopup(value: string) {
    navigate({
      pathname: location.pathname,
      search: popupQuerySearch(location.search, value),
    });
  }

  function closePopup() {
    navigate({
      pathname: location.pathname,
      search: popupQuerySearch(location.search, null),
    });
  }

  const ownerMember = useMemo(
    () =>
      members.find(
        (member) =>
          member.status === "active" &&
          (member.roleBuiltinKey === "owner" || member.userId === workspace?.ownerId),
      ) ?? null,
    [members, workspace?.ownerId],
  );

  const otherMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return members.filter((member) => {
      if (ownerMember && member.userId && member.userId === ownerMember.userId) {
        return false;
      }
      if (ownerMember && !member.userId && member.email === ownerMember.email) {
        return false;
      }
      if (!q) {
        return true;
      }
      const haystack = `${member.firstName ?? ""} ${member.lastName ?? ""} ${member.email}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [members, ownerMember, searchQuery]);

  const editingMember = useMemo(() => {
    if (!editMemberId) {
      return null;
    }
    return members.find((member) => member.userId === editMemberId && member.status === "active") ?? null;
  }, [editMemberId, members]);

  const canPost = permissions.post >= 1;
  const canPut = permissions.put >= 1;
  const canDelete = permissions.delete >= 1;

  async function handleRevokeInvite(member: WorkspaceMemberDto) {
    if (!core || !member.invitationId || !canDelete) {
      return;
    }
    try {
      await runSaveWithToast(
        {
          loading: t("web.workspaceSettings.members.invite.revoking"),
          success: t("web.workspaceSettings.members.invite.revoked"),
          error: t("web.toast.save.error"),
        },
        async () => {
          await core.revokeWorkspaceInvitation(workspaceId, member.invitationId!);
          await load();
        },
      );
    } catch {
      /* toast */
    }
  }

  return (
    <div className="flex flex-col gap-9">
      <MembersSectionHeader t={t} />

      {loading ? (
        <SettingsListCardSkeleton
          withFooterButton={false}
          label={t("web.workspaceSettings.members.loading")}
        />
      ) : null}

      {error ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="secondary" className="w-fit" onClick={() => void load()}>
            {t("web.workspaceSettings.members.retry")}
          </Button>
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          {ownerMember ? (
            <MembersListCard
              members={[ownerMember]}
              t={t}
              onMemberClick={(member) => {
                if (member.userId) {
                  openPopup(buildPopupQueryValue(EDIT_MEMBER_POPUP_ID, member.userId));
                }
              }}
            />
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("web.workspaceSettings.members.searchPlaceholder")}
              className="h-9 min-w-0 flex-1"
            />
            {canPost ? (
              <Button
                type="button"
                className="h-9 shrink-0 gap-1 px-3"
                onClick={() => openPopup(INVITE_MEMBERS_POPUP_ID)}
              >
                <PlusIcon className="size-4" />
                {t("web.workspaceSettings.members.invite.action")}
              </Button>
            ) : null}
          </div>

          <MembersListCard
            members={otherMembers}
            t={t}
            onMemberClick={(member) => {
              if (member.userId) {
                openPopup(buildPopupQueryValue(EDIT_MEMBER_POPUP_ID, member.userId));
              }
            }}
            onRevokeInvite={canDelete ? (member) => void handleRevokeInvite(member) : undefined}
          />
        </>
      ) : null}

      {inviteOpen && core ? (
        <InviteMembersPopup
          popupId={INVITE_MEMBERS_POPUP_ID}
          workspaceId={workspaceId}
          core={core}
          roles={roles}
          t={t}
          onClose={closePopup}
          onSent={() => load()}
        />
      ) : null}

      {editingMember && core && userId ? (
        <MemberCardPopup
          popupId={buildPopupQueryValue(EDIT_MEMBER_POPUP_ID, editingMember.userId ?? "")}
          workspaceId={workspaceId}
          member={editingMember}
          core={core}
          userId={userId}
          accountVaultKey={vaultKey}
          roles={roles}
          profiles={profiles}
          locale={locale}
          canPut={canPut}
          canDelete={canDelete}
          t={t}
          onClose={closePopup}
          onSaved={() => load()}
          onOpenMember={(targetUserId) =>
            openPopup(buildPopupQueryValue(EDIT_MEMBER_POPUP_ID, targetUserId))
          }
        />
      ) : null}
    </div>
  );
}
