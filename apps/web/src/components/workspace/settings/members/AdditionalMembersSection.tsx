import InviteMembersPopup from "./InviteMembersPopup";
import MemberCardPopup from "./MemberCardPopup";
import MembersListCard from "@/components/workspace/settings/members/MembersListCard";
import { useAuthVault, useAuthenticatedCoreClient } from "@/auth/AuthVaultContext";
import { useLocale } from "@/locale/LocaleContext";
import {
  buildPopupQueryValue,
  EDIT_MEMBER_POPUP_ID,
  INVITE_MEMBERS_POPUP_ID,
  parsePopupQueryValue,
  popupQuerySearch,
  POPUP_QUERY_PARAM,
} from "@okkey/popup-query";

import type {
  Workspace,
  WorkspaceMemberDto,
  WorkspaceMembersPermissionCellDto,
  WorkspaceProfileSummary,
  WorkspaceResourcePermissionDto,
  WorkspaceRoleSummary,
} from "@okkey/types";
import {
  permissionAllowsObject,
  permissionAllowsPost,
} from "@okkey/types";
import { canManageCustomWorkspaceProfiles } from "../profiles/builtinProfiles";
import { canManageCustomWorkspaceRoles } from "../roles/builtinRoles";
import type { WebMessageValues } from "@okkey/i18n";
import { Alert, AlertDescription, AlertTitle, Button, Input, cn } from "@okkey/ui";
import { useCallback, useEffect, useMemo, useState, type ReactNode, type SVGProps } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

type Props = {
  workspaceId: string;
  workspace?: Workspace;
  t: (messageKey: string, values?: WebMessageValues) => string;
  /** Prefer parent matrix cell when provided; otherwise use list actorPermissions. */
  resourcePermissions?: WorkspaceResourcePermissionDto | null;
  /**
   * Plan denies additional members: list + delete/revoke stay available;
   * invites and role/vault-access configuration are disabled.
   */
  readOnly?: boolean;
  /** Shown when readOnly and there are no additional members (Core upsell). */
  emptyFallback?: ReactNode;
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

function AlertInfoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function SearchIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M7.33333 12.6667C10.2789 12.6667 12.6667 10.2789 12.6667 7.33333C12.6667 4.38781 10.2789 2 7.33333 2C4.38781 2 2 4.38781 2 7.33333C2 10.2789 4.38781 12.6667 7.33333 12.6667Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 14L11.1 11.1"
        stroke="currentColor"
        strokeWidth="1"
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

export default function AdditionalMembersSection({
  workspaceId,
  workspace,
  t,
  resourcePermissions = null,
  readOnly = false,
  emptyFallback = null,
}: Props) {
  const core = useAuthenticatedCoreClient();
  const { userId, vaultKey } = useAuthVault();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [members, setMembers] = useState<WorkspaceMemberDto[]>([]);
  const [listPermissions, setListPermissions] =
    useState<WorkspaceMembersPermissionCellDto>(EMPTY_PERMISSIONS);
  const [roles, setRoles] = useState<WorkspaceRoleSummary[]>([]);
  const [profiles, setProfiles] = useState<WorkspaceProfileSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const popupRaw = searchParams.get(POPUP_QUERY_PARAM);
  const parsedPopup = parsePopupQueryValue(popupRaw);
  const inviteOpen = parsedPopup?.popupId === INVITE_MEMBERS_POPUP_ID;
  const editMemberId =
    parsedPopup?.popupId === EDIT_MEMBER_POPUP_ID ? (parsedPopup.menuItemId ?? null) : null;

  const load = useCallback(async () => {
    if (!core) {
      return;
    }
    try {
      const [membersResponse, rolesResponse, profilesResponse] = await Promise.all([
        core.listWorkspaceMembers(workspaceId),
        core.listWorkspaceRoles(workspaceId),
        core.listWorkspaceProfiles(workspaceId),
      ]);
      setMembers(membersResponse.members);
      setListPermissions(membersResponse.actorPermissions?.members ?? EMPTY_PERMISSIONS);
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
    } catch {
      setMembers([]);
      setListPermissions(EMPTY_PERMISSIONS);
    }
  }, [core, workspaceId]);

  useEffect(() => {
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

  const hasAdditionalMembers = useMemo(
    () =>
      members.some((member) => {
        if (ownerMember && member.userId && member.userId === ownerMember.userId) {
          return false;
        }
        if (ownerMember && !member.userId && member.email === ownerMember.email) {
          return false;
        }
        return true;
      }),
    [members, ownerMember],
  );

  const assignableRoles = useMemo(
    () =>
      canManageCustomWorkspaceRoles(workspace)
        ? roles
        : roles.filter(
            (role) =>
              role.kind === "builtin" &&
              (role.builtinId === "admin" || role.builtinId === "user" || role.builtinId === "owner"),
          ),
    [roles, workspace],
  );
  const assignableProfiles = useMemo(
    () =>
      canManageCustomWorkspaceProfiles(workspace)
        ? profiles
        : profiles.filter(
            (profile) =>
              profile.kind === "builtin" &&
              (profile.builtinId === "extended" || profile.builtinId === "simple"),
          ),
    [profiles, workspace],
  );

  const editingMember = useMemo(() => {
    if (!editMemberId) {
      return null;
    }
    return (
      members.find(
        (member) =>
          (member.userId != null && member.userId === editMemberId) ||
          (member.invitationId != null && member.invitationId === editMemberId),
      ) ?? null
    );
  }, [editMemberId, members]);

  const permissions = resourcePermissions ?? listPermissions;
  const canPost = !readOnly && permissionAllowsPost(permissions.post);
  const editingIsOwn = Boolean(
    userId &&
      (editingMember?.userId === userId ||
        (editingMember?.invitedBy?.userId != null && editingMember.invitedBy.userId === userId)),
  );
  const canPut = !readOnly && permissionAllowsObject(permissions.put, editingIsOwn);
  const canDelete =
    editingMember?.userId !== userId &&
    editingMember?.userId !== workspace?.ownerId &&
    editingMember?.roleBuiltinKey !== "owner" &&
    permissionAllowsObject(
      permissions.delete,
      Boolean(
        userId &&
          editingMember?.invitedBy?.userId != null &&
          editingMember.invitedBy.userId === userId,
      ),
    );

  function openMemberCard(member: WorkspaceMemberDto) {
    const id = member.userId ?? member.invitationId;
    if (id) {
      openPopup(buildPopupQueryValue(EDIT_MEMBER_POPUP_ID, id));
    }
  }

  const inviteLabel = t("web.workspaceSettings.members.invite.action");
  const inviteButton = readOnly ? null : (
    <Button
      type="button"
      className="size-9 shrink-0 px-0 sm:h-9 sm:w-auto sm:px-3"
      disabled={!canPost}
      aria-label={inviteLabel}
      onClick={() => openPopup(INVITE_MEMBERS_POPUP_ID)}
    >
      <PlusIcon className="size-4" />
      <span className="hidden sm:inline">{inviteLabel}</span>
    </Button>
  );

  return (
    <>
      <div className="flex flex-col gap-4">
        {hasAdditionalMembers ? (
          <>
            <div className="flex items-center gap-3">
              <div className="relative min-w-0 flex-1 sm:max-w-[380px]">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t("web.workspaceSettings.members.searchPlaceholder")}
                  className="h-9 w-full pl-9"
                />
              </div>
              {inviteButton ? <div className="sm:ms-auto">{inviteButton}</div> : null}
            </div>

            <MembersListCard
              members={otherMembers}
              t={t}
              onMemberClick={openMemberCard}
              listWindowResetKey={searchQuery.trim().toLowerCase()}
              footerAction={
                readOnly
                  ? undefined
                  : {
                      label: t("web.workspaceSettings.members.invite.title"),
                      onClick: () => openPopup(INVITE_MEMBERS_POPUP_ID),
                      disabled: !canPost,
                    }
              }
            />
          </>
        ) : readOnly ? (
          emptyFallback
        ) : (
          <Alert
            variant="info"
            className="[&>svg]:top-1/2 [&>svg]:-translate-y-1/2 [&>svg+div]:translate-y-0"
          >
            <AlertInfoIcon className="size-4" />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <AlertTitle className="leading-5">{t("web.workspaceSettings.members.additional.emptyNoteTitle")}</AlertTitle>
                <AlertDescription>
                  {t("web.workspaceSettings.members.additional.emptyNote")}
                </AlertDescription>
              </div>
              {inviteButton}
            </div>
          </Alert>
        )}
      </div>

      {inviteOpen && canPost && core ? (
        <InviteMembersPopup
          popupId={INVITE_MEMBERS_POPUP_ID}
          workspaceId={workspaceId}
          core={core}
          roles={assignableRoles}
          t={t}
          onClose={closePopup}
          onSent={() => load()}
        />
      ) : null}

      {editingMember && core && userId ? (
        <MemberCardPopup
          popupId={buildPopupQueryValue(
            EDIT_MEMBER_POPUP_ID,
            editingMember.userId ?? editingMember.invitationId ?? "",
          )}
          workspaceId={workspaceId}
          member={editingMember}
          core={core}
          userId={userId}
          accountVaultKey={vaultKey}
          roles={assignableRoles}
          profiles={assignableProfiles}
          locale={locale}
          canPut={canPut}
          canDelete={canDelete}
          readOnly={readOnly}
          t={t}
          onClose={closePopup}
          onSaved={() => load()}
          onOpenMember={(targetUserId) =>
            openPopup(buildPopupQueryValue(EDIT_MEMBER_POPUP_ID, targetUserId))
          }
        />
      ) : null}
    </>
  );
}
