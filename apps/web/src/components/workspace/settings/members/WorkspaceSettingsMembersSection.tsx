import type {
  Workspace,
  WorkspaceMemberDto,
  WorkspaceResourcePermissionDto,
} from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { Button } from "@okkey/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuthenticatedCoreClient } from "../../../../auth/AuthVaultContext";
import AdditionalMembersSection from "./AdditionalMembersSection";
import WorkspaceKeyPendingNotice from "./WorkspaceKeyPendingNotice";
import {
  buildPopupQueryValue,
  EDIT_MEMBER_POPUP_ID,
  popupQuerySearch,
} from "../../../../routes/popupQuery";
import SettingsListCardSkeleton from "../SettingsListCardSkeleton";
import AdditionalMembersUpsell from "./AdditionalMembersUpsell";
import MembersListCard from "./MembersListCard";
import MembersSectionHeader from "./MembersSectionHeader";
import { canInviteAdditionalWorkspaceMembers } from "./membersPlanAccess";

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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberDto[]>([]);

  const canManageAdditional = canInviteAdditionalWorkspaceMembers(workspace);

  const load = useCallback(async () => {
    if (!core) {
      return;
    }
    setError(null);
    try {
      const membersResponse = await core.listWorkspaceMembers(workspaceId);
      setMembers(membersResponse.members);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("web.toast.save.error"));
      setMembers([]);
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
  const openOwnerMemberCard = useCallback(
    (member: WorkspaceMemberDto) => {
      const id = member.userId ?? member.invitationId;
      if (!id) {
        return;
      }
      navigate({
        pathname: location.pathname,
        search: popupQuerySearch(location.search, buildPopupQueryValue(EDIT_MEMBER_POPUP_ID, id)),
      });
    },
    [navigate, location.pathname, location.search],
  );

  const additionalMembersUpsell = <AdditionalMembersUpsell t={t} />;

  return (
    <div className="flex flex-col gap-9">
      <MembersSectionHeader t={t} />
      {core ? <WorkspaceKeyPendingNotice core={core} workspaceId={workspaceId} t={t} /> : null}

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
              onMemberClick={openOwnerMemberCard}
            />
          ) : null}

          <AdditionalMembersSection
            workspaceId={workspaceId}
            workspace={workspace}
            t={t}
            resourcePermissions={resourcePermissions}
            readOnly={!canManageAdditional}
            emptyFallback={!canManageAdditional ? additionalMembersUpsell : undefined}
          />
        </>
      ) : null}
    </div>
  );
}
