import type {
  Workspace,
  WorkspaceMemberDto,
  WorkspacePermissionsMatrixDto,
  WorkspaceProfileSummary,
} from "@okkey/types";
import { hasPlanFeature, permissionAllowsPost } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import enterpriseSharedVaultsModule from "@okkey-enterprise/workspace-shared-vaults";

import { useAuthVault, useAuthenticatedCoreClient } from "../../../../auth/AuthVaultContext";
import {
  NEW_VAULT_POPUP_ID,
  POPUP_QUERY_PARAM,
  parsePopupQueryValue,
  popupQuerySearch,
} from "../../../../routes/popupQuery";
import { settingsSectionPermissionCell } from "../settingsPermissions";

type NewVaultPopupProps = {
  workspaceId: string;
  workspace?: Workspace;
  workspacePermissions?: WorkspacePermissionsMatrixDto | null;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onVaultsChanged?: () => void | Promise<void>;
};

export default function NewVaultPopup({
  workspaceId,
  workspace,
  workspacePermissions = null,
  t,
  onVaultsChanged,
}: NewVaultPopupProps) {
  const core = useAuthenticatedCoreClient();
  const { userId, vaultKey } = useAuthVault();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const SharedVaultCardPopup = enterpriseSharedVaultsModule.SharedVaultCardPopup;
  const canManageSharedPlan = hasPlanFeature(workspace?.planTier, "sharedVaults");
  const vaultPermissions = settingsSectionPermissionCell(workspacePermissions, "vaults");
  const canPost = permissionAllowsPost(vaultPermissions?.post ?? 0);

  const popupRaw = searchParams.get(POPUP_QUERY_PARAM);
  const isNewVault = parsePopupQueryValue(popupRaw)?.popupId === NEW_VAULT_POPUP_ID;
  const open = Boolean(
    isNewVault && canManageSharedPlan && SharedVaultCardPopup && canPost && core && userId,
  );

  const [members, setMembers] = useState<WorkspaceMemberDto[]>([]);
  const [profiles, setProfiles] = useState<WorkspaceProfileSummary[]>([]);

  useEffect(() => {
    if (!open || !core) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [membersResponse, profilesResponse] = await Promise.all([
          core.listWorkspaceMembers(workspaceId),
          core.listWorkspaceProfiles(workspaceId),
        ]);
        if (cancelled) {
          return;
        }
        setMembers(
          membersResponse.members.filter((member) => {
            if (member.status === "pending" && member.invitationId != null) {
              return true;
            }
            return (
              member.status === "active" &&
              member.userId != null &&
              member.publicKey.length > 0
            );
          }),
        );
        setProfiles(
          profilesResponse.profiles.map((profile) => {
            const row = profile as {
              id: string;
              name: string;
              description: string;
              kind?: "builtin" | "custom";
              builtin_id?: WorkspaceProfileSummary["builtinId"];
              application_count: number;
            };
            return {
              id: row.id,
              name: row.name,
              description: row.description,
              kind: row.kind ?? "builtin",
              builtinId: row.builtin_id,
              applicationCount: row.application_count,
            };
          }),
        );
      } catch {
        if (!cancelled) {
          setMembers([]);
          setProfiles([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [core, open, workspaceId]);

  function closePopup() {
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, null),
        hash: location.hash,
      },
      { replace: true },
    );
  }

  if (!open || !SharedVaultCardPopup || !core || !userId) {
    return null;
  }

  return (
    <SharedVaultCardPopup
      popupId={NEW_VAULT_POPUP_ID}
      mode="shared"
      workspaceId={workspaceId}
      core={core}
      userId={userId}
      accountVaultKey={vaultKey}
      members={members}
      profiles={profiles}
      initialAccessByUserId={{}}
      t={t}
      onClose={closePopup}
      onSaved={async () => {
        await onVaultsChanged?.();
      }}
    />
  );
}
