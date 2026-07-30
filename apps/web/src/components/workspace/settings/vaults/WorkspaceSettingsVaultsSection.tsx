import type { Vault, Workspace, WorkspaceMemberDto, WorkspaceProfileSummary } from "@okkey/types";
import { hasPlanFeature } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { Button, cn } from "@okkey/ui";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useAuthVault, useAuthenticatedCoreClient } from "../../../../auth/AuthVaultContext";
import {
  EDIT_VAULT_POPUP_ID,
  NEW_VAULT_POPUP_ID,
  POPUP_QUERY_PARAM,
  buildPopupQueryValue,
  parsePopupQueryValue,
  popupQuerySearch,
} from "../../../../routes/popupQuery";

import SharedVaultsUpsell from "./SharedVaultsUpsell";
import VaultCardPopup from "./VaultCardPopup";
import VaultListRow from "./VaultListRow";
import VaultsSectionHeader from "./VaultsSectionHeader";
import {
  DEFAULT_PERSONAL_VAULT_ICON,
  DEFAULT_SHARED_VAULT_ICON,
  normalizeVaultIcon,
} from "./vaultIcons";

type WorkspaceSettingsVaultsSectionProps = {
  workspaceId: string;
  workspace?: Workspace;
  vaults: readonly Vault[];
  t: (messageKey: string, values?: WebMessageValues) => string;
  onVaultsChanged?: () => void | Promise<void>;
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

export default function WorkspaceSettingsVaultsSection({
  workspaceId,
  workspace,
  vaults,
  t,
  onVaultsChanged,
}: WorkspaceSettingsVaultsSectionProps) {
  const core = useAuthenticatedCoreClient();
  const { userId, vaultKey } = useAuthVault();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const canManageShared = hasPlanFeature(workspace?.planTier, "sharedVaults");

  const personalVault = useMemo(() => vaults.find((vault) => vault.isPersonal) ?? null, [vaults]);
  const sharedVaults = useMemo(() => vaults.filter((vault) => !vault.isPersonal), [vaults]);

  const [members, setMembers] = useState<WorkspaceMemberDto[]>([]);
  const [profiles, setProfiles] = useState<WorkspaceProfileSummary[]>([]);
  const [accessByVaultId, setAccessByVaultId] = useState<Record<string, Record<string, string | null>>>(
    {},
  );

  const popupRaw = searchParams.get(POPUP_QUERY_PARAM);
  const parsedPopup = parsePopupQueryValue(popupRaw);
  const isNewVault = parsedPopup?.popupId === NEW_VAULT_POPUP_ID;
  const isEditVault = parsedPopup?.popupId === EDIT_VAULT_POPUP_ID;
  const editVaultId = isEditVault ? parsedPopup?.menuItemId : undefined;
  const editingVault = editVaultId ? vaults.find((vault) => vault.id === editVaultId) : undefined;

  useEffect(() => {
    if (!core || !canManageShared) {
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
        setMembers(membersResponse.members);
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
        if (!cancelled) {
          setMembers([]);
          setProfiles([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [core, workspaceId, canManageShared]);

  useEffect(() => {
    if (!core || !editingVault || editingVault.isPersonal) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const access = await core.getVaultAccess(editingVault.id);
        if (cancelled) {
          return;
        }
        const map: Record<string, string | null> = {};
        for (const member of members) {
          map[member.userId] = null;
        }
        for (const row of access.members) {
          map[row.userId] = row.profileId;
        }
        setAccessByVaultId((current) => ({ ...current, [editingVault.id]: map }));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [core, editingVault, members]);

  function openPopup(value: string) {
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

  async function handleSaved() {
    await onVaultsChanged?.();
  }

  const popupOpen =
    (isNewVault && canManageShared) ||
    (isEditVault && editingVault != null);

  const resolvedPopupMode: "personal" | "shared" = editingVault
    ? editingVault.isPersonal
      ? "personal"
      : "shared"
    : "shared";

  // Personal edit does not need members; shared create/edit does.
  const membersForPopup =
    resolvedPopupMode === "personal" ? ([] as WorkspaceMemberDto[]) : members;
  const profilesForPopup =
    resolvedPopupMode === "personal" ? ([] as WorkspaceProfileSummary[]) : profiles;

  return (
    <div className="flex flex-col gap-9">
      <VaultsSectionHeader t={t} />

      {personalVault ? (
        <div className="px-px">
          <VaultListRow
            icon={normalizeVaultIcon(personalVault.icon, DEFAULT_PERSONAL_VAULT_ICON)}
            title={personalVault.name || t("web.workspaceSettings.vaults.personal.title")}
            description={
              personalVault.description || t("web.workspaceSettings.vaults.personal.description")
            }
            trailing={t("web.workspaceSettings.vaults.personal.onlyYou")}
            onClick={() => openPopup(buildPopupQueryValue(EDIT_VAULT_POPUP_ID, personalVault.id))}
          />
        </div>
      ) : null}

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
          {canManageShared ? (
            <Button
              type="button"
              size="sm"
              className="mt-1.5 shrink-0 gap-1 max-md:h-8 max-md:w-8 max-md:min-h-8 max-md:min-w-8 max-md:rounded-sm max-md:!p-0"
              onClick={() => openPopup(NEW_VAULT_POPUP_ID)}
              aria-label={t("web.workspaceSettings.vaults.shared.create")}
            >
              <PlusIcon className="size-4" />
              <span className="max-md:hidden">{t("web.workspaceSettings.vaults.shared.create")}</span>
            </Button>
          ) : null}
        </div>

        {!canManageShared ? <SharedVaultsUpsell t={t} /> : null}

        {canManageShared && sharedVaults.length > 0 ? (
          <div className="px-px">
            <div className="overflow-hidden rounded-lg border border-border">
              {sharedVaults.map((vault, index) => {
                const isFirst = index === 0;
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
                    rounded={isFirst ? "top" : "none"}
                    className={cn(
                      !isFirst && "-mt-px border-t-border",
                      "border-x-transparent border-b-transparent",
                      isFirst && "border-t-transparent",
                    )}
                  />
                );
              })}
              <Button
                type="button"
                variant="secondary"
                className={cn(
                  "relative -mt-px h-8 w-full rounded-b-lg rounded-t-none border border-border bg-secondary px-3 font-medium text-foreground shadow-none",
                  "border-x-transparent border-b-transparent",
                  "hover:bg-[color-mix(in_hsl,hsl(var(--secondary))_94%,hsl(var(--foreground))_6%)]",
                  "focus:z-10 focus:border-accent focus:!border-t-accent",
                  "focus-visible:z-10 focus-visible:border-accent focus-visible:!border-t-accent",
                )}
                onClick={() => openPopup(NEW_VAULT_POPUP_ID)}
              >
                <PlusIcon className="size-4" />
                {t("web.workspaceSettings.vaults.card.createTitle")}
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      {popupOpen && core && userId ? (
        <VaultCardPopup
          popupId={isNewVault ? NEW_VAULT_POPUP_ID : `${EDIT_VAULT_POPUP_ID}|${editVaultId}`}
          mode={resolvedPopupMode}
          initialVault={editingVault}
          workspaceId={workspaceId}
          core={core}
          userId={userId}
          accountVaultKey={vaultKey}
          members={membersForPopup}
          profiles={profilesForPopup}
          initialAccessByUserId={
            editingVault && !editingVault.isPersonal
              ? accessByVaultId[editingVault.id] ?? {}
              : {}
          }
          t={t}
          onClose={closePopup}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
