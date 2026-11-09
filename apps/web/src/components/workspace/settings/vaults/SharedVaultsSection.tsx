import SettingsListCardSkeleton from "@/components/workspace/settings/SettingsListCardSkeleton";
import VaultCardPopup from "./VaultCardPopup";
import VaultListRow from "@/components/workspace/settings/vaults/VaultListRow";
import {
  DEFAULT_SHARED_VAULT_ICON,
  normalizeVaultIcon,
} from "@/components/workspace/settings/vaults/vaultIcons";
import { useAuthVault, useAuthenticatedCoreClient } from "@/auth/AuthVaultContext";
import { usePopupZoneGate } from "@/auth/usePopupZoneGate";
import {
  EDIT_VAULT_POPUP_ID,
  NEW_VAULT_POPUP_ID,
  POPUP_QUERY_PARAM,
  buildPopupQueryValue,
  parsePopupQueryValue,
  popupQuerySearch,
} from "@okkey/popup-query";

import type {
  Vault,
  Workspace,
  WorkspaceMemberDto,
  WorkspaceProfileSummary,
  WorkspaceResourcePermissionDto,
} from "@okkey/types";
import {
  permissionAllowsObject,
  permissionAllowsPost,
} from "@okkey/types";
import { canManageCustomWorkspaceProfiles } from "../profiles/builtinProfiles";
import type { WebMessageValues } from "@okkey/i18n";
import { Button, cn } from "@okkey/ui";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import ListScrollSentinel from "@/lists/ListScrollSentinel";
import { useListWindow } from "@/lists/useListWindow";

type Props = {
  workspaceId: string;
  workspace?: Workspace;
  vaults: readonly Vault[];
  vaultsListReady?: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onVaultsChanged?: () => void | Promise<void>;
  personalVaultId?: string | null;
  resourcePermissions?: WorkspaceResourcePermissionDto | null;
  /** Plan denies shared vaults: existing vaults stay viewable and deletable; create/update hidden. */
  readOnly?: boolean;
  /** Shown when readOnly and there are no shared vaults (Core upsell). */
  emptyFallback?: ReactNode;
};

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
    >
      <path
        d="M3.33337 8H12.6667M8.00004 3.33337V12.6667"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SharedVaultsSection({
  workspaceId,
  vaults,
  vaultsListReady = true,
  t,
  onVaultsChanged,
  resourcePermissions = null,
  readOnly = false,
  emptyFallback = null,
}: Props) {
  const core = useAuthenticatedCoreClient();
  const { userId, vaultKey } = useAuthVault();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const sharedVaults = useMemo(() => vaults.filter((vault) => !vault.isPersonal), [vaults]);
  const {
    visibleCount: visibleSharedCount,
    hasMore: sharedVaultsHasMore,
    loadMore: loadMoreSharedVaults,
  } = useListWindow({
    total: sharedVaults.length,
    resetKey: workspaceId,
  });
  const visibleSharedVaults = sharedVaults.slice(0, visibleSharedCount);

  const [members, setMembers] = useState<WorkspaceMemberDto[]>([]);
  const [profiles, setProfiles] = useState<WorkspaceProfileSummary[]>([]);
  const [accessByVaultId, setAccessByVaultId] = useState<
    Record<string, Record<string, string | null>>
  >({});

  const popupRaw = searchParams.get(POPUP_QUERY_PARAM);
  const parsedPopup = parsePopupQueryValue(popupRaw);
  const isEditVault = parsedPopup?.popupId === EDIT_VAULT_POPUP_ID;
  const editVaultId = isEditVault ? parsedPopup?.menuItemId : undefined;
  const editingVault = editVaultId ? vaults.find((vault) => vault.id === editVaultId) : undefined;
  const editingShared = editingVault && !editingVault.isPersonal ? editingVault : undefined;

  const canPost = !readOnly && permissionAllowsPost(resourcePermissions?.post ?? 0);
  const editingIsOwn = Boolean(
    userId && editingShared?.ownerId != null && editingShared.ownerId === userId,
  );
  const canPutEditing =
    !readOnly && permissionAllowsObject(resourcePermissions?.put ?? 0, editingIsOwn);
  const canDeleteEditing = permissionAllowsObject(resourcePermissions?.delete ?? 0, editingIsOwn);

  useEffect(() => {
    if (!core) {
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
        const mappedProfiles = profilesResponse.profiles.map((profile) => {
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
        });
        setProfiles(
          canManageCustomWorkspaceProfiles(workspace)
            ? mappedProfiles
            : mappedProfiles.filter(
                (profile) =>
                  profile.kind === "builtin" &&
                  (profile.builtinId === "extended" || profile.builtinId === "simple"),
              ),
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
  }, [core, workspace, workspaceId]);

  useEffect(() => {
    if (!core || !editingShared) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const access = await core.getVaultAccess(editingShared.id);
        if (cancelled) {
          return;
        }
        const map: Record<string, string | null> = {};
        for (const member of members) {
          const key = member.userId ?? member.invitationId;
          if (key) {
            map[key] = null;
          }
        }
        for (const row of access.members) {
          map[row.userId] = row.profileId;
        }
        for (const row of access.invitations ?? []) {
          map[row.invitationId] = row.profileId;
        }
        setAccessByVaultId((current) => ({ ...current, [editingShared.id]: map }));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [core, editingShared, members]);

  function openPopup(value: string) {
    if (value === NEW_VAULT_POPUP_ID && !canPost) {
      return;
    }
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, value),
      },
      { replace: false },
    );
  }

  function closePopup() {
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, null),
      },
      { replace: true },
    );
  }

  /** Create (`newVault`) is mounted from workspace shell `NewVaultPopup` so sidebar "+" works on any route. */
  const sharedEditUrlOpen = Boolean(editingShared && core && userId);
  const popupOpen = usePopupZoneGate("vaultPopups", sharedEditUrlOpen, closePopup);

  if (readOnly && vaultsListReady && sharedVaults.length === 0) {
    return emptyFallback ?? null;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-sm font-medium text-foreground">
            {t("web.workspaceSettings.vaults.shared.title")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("web.workspaceSettings.vaults.shared.subtitle")}
          </p>
        </div>
        {readOnly ? null : (
          <Button
            type="button"
            className="mt-1.5 shrink-0 gap-1 max-md:h-9 max-md:w-9 max-md:min-h-9 max-md:min-w-9 max-md:rounded-md max-md:!p-0"
            onClick={() => openPopup(NEW_VAULT_POPUP_ID)}
            disabled={!vaultsListReady || !canPost}
            aria-label={t("web.workspaceSettings.vaults.shared.create")}
          >
            <PlusIcon className="size-4" />
            <span className="max-md:hidden">{t("web.workspaceSettings.vaults.shared.create")}</span>
          </Button>
        )}
      </div>

      {!vaultsListReady ? (
        <SettingsListCardSkeleton
          withLeadingIcon
          label={t("web.workspaceSettings.vaults.loading")}
        />
      ) : null}

      {vaultsListReady && sharedVaults.length > 0 ? (
        <div className="flex flex-col gap-4 px-px">
          <div>
            {visibleSharedVaults.map((vault, index) => {
              const isFirst = index === 0;
              const isLast = index === visibleSharedVaults.length - 1;
              return (
                <VaultListRow
                  key={vault.id}
                  icon={normalizeVaultIcon(vault.icon, DEFAULT_SHARED_VAULT_ICON)}
                  title={vault.name}
                  description={vault.description}
                  trailing={t("web.workspaceSettings.vaults.memberCount", {
                    count: vault.memberCount ?? 0,
                  })}
                  onClick={() => openPopup(buildPopupQueryValue(EDIT_VAULT_POPUP_ID, vault.id))}
                  rounded={
                    isFirst && isLast ? "both" : isFirst ? "top" : isLast ? "bottom" : "none"
                  }
                  className={cn(!isFirst && "-mt-px")}
                />
              );
            })}
            {sharedVaultsHasMore ? (
              <ListScrollSentinel onVisible={loadMoreSharedVaults} />
            ) : null}
          </div>
          {readOnly ? null : (
            <Button
              type="button"
              variant="secondary"
              className="w-full gap-1 font-medium"
              disabled={!canPost}
              onClick={() => openPopup(NEW_VAULT_POPUP_ID)}
            >
              <PlusIcon className="size-4" />
              {t("web.workspaceSettings.vaults.card.createTitle")}
            </Button>
          )}
        </div>
      ) : null}

      {popupOpen && core && userId && editingShared ? (
        <VaultCardPopup
          popupId={`${EDIT_VAULT_POPUP_ID}|${editVaultId}`}
          mode="shared"
          initialVault={editingShared}
          workspaceId={workspaceId}
          core={core}
          userId={userId}
          accountVaultKey={vaultKey}
          members={members}
          profiles={profiles}
          initialAccessByUserId={accessByVaultId[editingShared.id] ?? {}}
          readOnly={!canPutEditing}
          canDelete={canDeleteEditing}
          t={t}
          onClose={closePopup}
          onSaved={async () => {
            await onVaultsChanged?.();
          }}
        />
      ) : null}
    </section>
  );
}
