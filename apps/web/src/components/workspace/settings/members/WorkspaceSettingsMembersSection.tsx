import type {
  Workspace,
  WorkspaceMemberDto,
  WorkspaceMembersPermissionCellDto,
} from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { Button } from "@okkey/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import enterpriseMembersModule from "@okkey-enterprise/workspace-members";

import { useAuthenticatedCoreClient } from "../../../../auth/AuthVaultContext";
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

type WorkspaceSettingsMembersSectionProps = {
  workspaceId: string;
  workspace?: Workspace;
  t: (messageKey: string, values?: WebMessageValues) => string;
};

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
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberDto[]>([]);

  const canManageAdditional = canInviteAdditionalWorkspaceMembers(workspace?.planTier);
  const AdditionalMembersSection = enterpriseMembersModule.AdditionalMembersSection;
  const showEnterpriseMembers = Boolean(canManageAdditional && AdditionalMembersSection);

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

  // Clear stale member popups on FREE / without enterprise module.
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
          {ownerMember ? <MembersListCard members={[ownerMember]} t={t} /> : null}

          {showEnterpriseMembers && AdditionalMembersSection ? (
            <AdditionalMembersSection workspaceId={workspaceId} workspace={workspace} t={t} />
          ) : (
            <AdditionalMembersUpsell t={t} />
          )}
        </>
      ) : null}
    </div>
  );
}
