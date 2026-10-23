import type {
  Workspace,
  WorkspaceMemberDto,
  WorkspaceMembersPermissionCellDto,
  WorkspaceResourcePermissionDto,
} from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { Button } from "@okkey/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import enterpriseMembersModule from "@okkey-enterprise/workspace-members";

import { useAuthenticatedCoreClient, useAuthVault } from "../../../../auth/AuthVaultContext";
import {
  buildPopupQueryValue,
  EDIT_MEMBER_POPUP_ID,
  parsePopupQueryValue,
  popupQuerySearch,
  POPUP_QUERY_PARAM,
} from "../../../../routes/popupQuery";
import SettingsListCardSkeleton from "../SettingsListCardSkeleton";
import AdditionalMembersUpsell from "./AdditionalMembersUpsell";
import MembersListCard from "./MembersListCard";
import MembersSectionHeader from "./MembersSectionHeader";
import { canInviteAdditionalWorkspaceMembers } from "./membersPlanAccess";
import RemnantMembersList from "./RemnantMembersList";

const EMPTY_MEMBER_PERMISSIONS: WorkspaceMembersPermissionCellDto = { get: 0, post: 0, put: 0, delete: 0 };

type WorkspaceSettingsMembersSectionProps = {
  workspaceId: string;
  workspace?: Workspace;
  t: (messageKey: string, values?: WebMessageValues) => string;
  resourcePermissions?: WorkspaceResourcePermissionDto | null;
};

export default function WorkspaceSettingsMembersSection({
  workspaceId,
  workspace,
  t,
  resourcePermissions = null,
}: WorkspaceSettingsMembersSectionProps) {
  const core = useAuthenticatedCoreClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberDto[]>([]);
  const [memberPermissions, setMemberPermissions] =
    useState<WorkspaceMembersPermissionCellDto>(EMPTY_MEMBER_PERMISSIONS);
  const { userId } = useAuthVault();

  const canManageAdditional = canInviteAdditionalWorkspaceMembers(workspace);
  const AdditionalMembersSection = enterpriseMembersModule.AdditionalMembersSection;
  const showEnterpriseMembers = Boolean(AdditionalMembersSection);

  const load = useCallback(async () => {
    if (!core) {
      return;
    }
    setError(null);
    try {
      const membersResponse = await core.listWorkspaceMembers(workspaceId);
      setMembers(membersResponse.members);
      setMemberPermissions(membersResponse.actorPermissions?.members ?? EMPTY_MEMBER_PERMISSIONS);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("web.toast.save.error"));
      setMembers([]);
      setMemberPermissions(EMPTY_MEMBER_PERMISSIONS);
    } finally {
      setLoading(false);
    }
  }, [core, t, workspaceId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const ownerMember = useMemo(
    () =>
      members.find(
        (member) =>
          member.status === "active" &&
          (member.roleBuiltinKey === "owner" || member.userId === workspace?.ownerId),
      ) ?? null,
    [members, workspace?.ownerId],
  );
  const otherMembers = useMemo(
    () => members.filter((member) => member !== ownerMember),
    [members, ownerMember],
  );

  // Clear stale member popups without the enterprise module.
  useEffect(() => {
    if (showEnterpriseMembers) {
      return;
    }
    const parsed = parsePopupQueryValue(searchParams.get(POPUP_QUERY_PARAM));
    if (parsed?.popupId === EDIT_MEMBER_POPUP_ID) {
      navigate(
        {
          pathname: location.pathname,
          search: popupQuerySearch(location.search, null),
        },
        { replace: true },
      );
    }
  }, [showEnterpriseMembers, searchParams, navigate, location.pathname, location.search]);

  const openOwnerMemberCard = useCallback(
    (member: WorkspaceMemberDto) => {
      if (!showEnterpriseMembers) {
        return;
      }
      const id = member.userId ?? member.invitationId;
      if (!id) {
        return;
      }
      navigate({
        pathname: location.pathname,
        search: popupQuerySearch(location.search, buildPopupQueryValue(EDIT_MEMBER_POPUP_ID, id)),
      });
    },
    [showEnterpriseMembers, navigate, location.pathname, location.search],
  );

  const additionalMembersUpsell = <AdditionalMembersUpsell t={t} />;

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
              onMemberClick={showEnterpriseMembers ? openOwnerMemberCard : undefined}
            />
          ) : null}

          {AdditionalMembersSection ? (
            <AdditionalMembersSection
              workspaceId={workspaceId}
              workspace={workspace}
              t={t}
              resourcePermissions={resourcePermissions}
              readOnly={!canManageAdditional}
              emptyFallback={!canManageAdditional ? additionalMembersUpsell : undefined}
            />
          ) : core ? (
            <AdditionalMembersUpsell t={t}>
              <RemnantMembersList
                workspaceId={workspaceId}
                core={core}
                t={t}
                members={otherMembers}
                actorId={userId}
                permissions={memberPermissions}
                onChanged={load}
              />
            </AdditionalMembersUpsell>
          ) : (
            additionalMembersUpsell
          )}
        </>
      ) : null}
    </div>
  );
}
