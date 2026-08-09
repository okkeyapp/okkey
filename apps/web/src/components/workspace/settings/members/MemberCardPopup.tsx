import type { CoreApiClient } from "@okkey/api";
import type {
  EncryptedBlobDto,
  MemberVaultAccessEntryDto,
  MemberVaultAccessUpdateRequestDto,
  WorkspaceMemberDto,
  WorkspaceProfileSummary,
  WorkspaceRoleSummary,
} from "@okkey/types";
import {
  createOpaqueVaultEventPayload,
  decryptUserIdentityFromEncryptedBlob,
  generateSharedVaultKey,
  unwrapVaultKeyForSelf,
  wrapVaultKeyForRecipient,
} from "@okkey/crypto";
import type { WebMessageValues } from "@okkey/i18n";
import {
  Button,
  Input,
  Popup,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@okkey/ui";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { readVaultBundle } from "../../../../auth/localVaultBundle";
import { base64ToBytes } from "../../../../auth/base64";
import { runSaveWithToast } from "../../../../lib/saveWithToast";
import { settingsPath } from "../../../../routes/paths";
import {
  GHOST_SELECT_PROFILE_ALIGN_CLASS,
  GHOST_SELECT_ROLE_ALIGN_CLASS,
  localizedProfileLabel,
  localizedRoleLabel,
} from "../localizedWorkspaceLabels";
import VaultCardActionsMenu, {
  MemberFavicon,
  memberDisplayName,
  type AccessFilterValue,
} from "../vaults/vaultAccessHelpers";
import DeleteMemberConfirmPopup from "./DeleteMemberConfirmPopup";

const NO_ACCESS_VALUE = "__none__";

type MemberCardPopupProps = {
  popupId: string;
  workspaceId: string;
  member: WorkspaceMemberDto;
  core: CoreApiClient;
  userId: string;
  accountVaultKey: Uint8Array | null;
  roles: readonly WorkspaceRoleSummary[];
  profiles: readonly WorkspaceProfileSummary[];
  locale: string;
  canPut: boolean;
  canDelete: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onOpenMember: (userId: string) => void;
};

function GearIcon({ className }: { className?: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <path
        d="M6.48667 1.33337H9.51333L10.06 3.20671C10.4867 3.37337 10.88 3.59337 11.2333 3.86004L13.08 3.26004L14.5933 5.88004L13.1 7.14004C13.14 7.42004 13.1667 7.70671 13.1667 8.00004C13.1667 8.29337 13.14 8.58004 13.1 8.86004L14.5933 10.12L13.08 12.74L11.2333 12.14C10.88 12.4067 10.4867 12.6267 10.06 12.7934L9.51333 14.6667H6.48667L5.94 12.7934C5.51333 12.6267 5.12 12.4067 4.76667 12.14L2.92 12.74L1.40667 10.12L2.9 8.86004C2.86 8.58004 2.83333 8.29337 2.83333 8.00004C2.83333 7.70671 2.86 7.42004 2.9 7.14004L1.40667 5.88004L2.92 3.26004L4.76667 3.86004C5.12 3.59337 5.51333 3.37337 5.94 3.20671L6.48667 1.33337Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" />
      <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <path
        d="M2 3.5H14M4 8H12M6.5 12.5H9.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatDateTime(iso: string | null, locale: string): string {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatRelativeDays(iso: string | null, t: MemberCardPopupProps["t"]): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)));
  return t("web.workspaceSettings.members.card.relativeDays", { count: days });
}

function actorLabel(actor: WorkspaceMemberDto["invitedBy"]): string {
  if (!actor) {
    return "—";
  }
  return memberDisplayName(actor);
}

export default function MemberCardPopup({
  popupId,
  workspaceId,
  member,
  core,
  userId,
  accountVaultKey,
  roles,
  profiles,
  locale,
  canPut,
  canDelete,
  t,
  onClose,
  onSaved,
  onOpenMember,
}: MemberCardPopupProps) {
  const isPending = member.status === "pending";
  const isOwner = member.roleBuiltinKey === "owner";
  const displayName = memberDisplayName(member);

  const assignableRoles = useMemo(
    () => roles.filter((role) => role.builtinId !== "owner"),
    [roles],
  );

  const [roleId, setRoleId] = useState(member.roleId ?? "");
  const [initialRoleId, setInitialRoleId] = useState(member.roleId ?? "");
  const [vaultAccess, setVaultAccess] = useState<MemberVaultAccessEntryDto[]>([]);
  const [initialVaultAccess, setInitialVaultAccess] = useState<Record<string, string | null>>({});
  const [accessByVaultId, setAccessByVaultId] = useState<Record<string, string | null>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [accessFilter, setAccessFilter] = useState<AccessFilterValue>("all");
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    setRoleId(member.roleId ?? "");
    setInitialRoleId(member.roleId ?? "");
    setSearchQuery("");
    setAccessFilter("all");
    setDeleteConfirmOpen(false);
  }, [member]);

  useEffect(() => {
    let cancelled = false;
    setLoadingAccess(true);
    void (async () => {
      try {
        const response =
          isPending && member.invitationId
            ? await core.getInvitationVaultAccess(workspaceId, member.invitationId)
            : member.userId
              ? await core.getMemberVaultAccess(workspaceId, member.userId)
              : { vaults: [] as MemberVaultAccessEntryDto[] };
        if (cancelled) {
          return;
        }
        setVaultAccess(response.vaults);
        const map: Record<string, string | null> = {};
        for (const entry of response.vaults) {
          map[entry.vaultId] = entry.profileId;
        }
        setInitialVaultAccess(map);
        setAccessByVaultId(map);
      } catch {
        if (!cancelled) {
          setVaultAccess([]);
          setInitialVaultAccess({});
          setAccessByVaultId({});
        }
      } finally {
        if (!cancelled) {
          setLoadingAccess(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [core, workspaceId, member.userId, member.invitationId, isPending]);

  const filteredVaults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return vaultAccess.filter((vault) => {
      const profileId = accessByVaultId[vault.vaultId] ?? null;
      const hasAccess = Boolean(profileId);
      if (accessFilter === "with_access" && !hasAccess) {
        return false;
      }
      if (accessFilter === "without_access" && hasAccess) {
        return false;
      }
      if (accessFilter.startsWith("profile:")) {
        const filterProfileId = accessFilter.slice("profile:".length);
        if (profileId !== filterProfileId) {
          return false;
        }
      }
      if (!q) {
        return true;
      }
      return vault.name.toLowerCase().includes(q);
    });
  }, [vaultAccess, searchQuery, accessFilter, accessByVaultId]);

  const dirty =
    roleId !== initialRoleId ||
    vaultAccess.some(
      (vault) =>
        (accessByVaultId[vault.vaultId] ?? null) !== (initialVaultAccess[vault.vaultId] ?? null),
    );

  const filterLabel = (value: AccessFilterValue): string => {
    if (value === "all") {
      return t("web.workspaceSettings.vaults.access.filterAll", { count: vaultAccess.length });
    }
    if (value === "with_access") {
      return t("web.workspaceSettings.vaults.access.filterWithAccess");
    }
    if (value === "without_access") {
      return t("web.workspaceSettings.vaults.access.filterWithoutAccess");
    }
    const profileId = value.slice("profile:".length);
    const profile = profiles.find((item) => item.id === profileId);
    return profile ? localizedProfileLabel(profile, t) : value;
  };

  function profileSelectLabel(profileId: string | null): string {
    if (!profileId) {
      return t("web.workspaceSettings.vaults.access.noAccess");
    }
    const profile = profiles.find((item) => item.id === profileId);
    return profile
      ? localizedProfileLabel(profile, t)
      : t("web.workspaceSettings.vaults.access.noAccess");
  }

  async function wrapForUser(
    vaultKey: Uint8Array,
    target: WorkspaceMemberDto,
  ): Promise<EncryptedBlobDto> {
    if (!accountVaultKey || !target.userId || !target.publicPqKey) {
      throw new Error(t("web.workspaceSettings.vaults.errors.unlockRequired"));
    }
    const bundle = readVaultBundle(userId);
    if (!bundle) {
      throw new Error(t("web.workspaceSettings.vaults.errors.unlockRequired"));
    }
    const identity = await decryptUserIdentityFromEncryptedBlob(
      accountVaultKey,
      bundle.encrypted_private_key.payload,
    );
    return wrapVaultKeyForRecipient({
      vaultKey,
      recipientUserId: target.userId,
      senderPrivateKey: identity.ed25519SecretKey,
      recipientPublicKey: base64ToBytes(target.publicKey),
      recipientPqPublicKey: base64ToBytes(target.publicPqKey),
    });
  }

  async function handleSave() {
    if (!canPut || !dirty) {
      return;
    }
    if (isPending && !member.invitationId) {
      return;
    }
    if (!isPending && !member.userId) {
      return;
    }

    setSaving(true);
    try {
      await runSaveWithToast(
        {
          loading: t("web.toast.save.loading"),
          success: t("web.toast.save.success"),
          error: t("web.toast.save.error"),
        },
        async () => {
          if (isPending) {
            if (roleId !== initialRoleId && roleId) {
              await core.updateWorkspaceInvitation(workspaceId, member.invitationId!, { roleId });
            }
            const invitationChanges: Array<{ vaultId: string; profileId: string | null }> = [];
            for (const vault of vaultAccess) {
              const before = initialVaultAccess[vault.vaultId] ?? null;
              const after = accessByVaultId[vault.vaultId] ?? null;
              if (before !== after) {
                invitationChanges.push({ vaultId: vault.vaultId, profileId: after });
              }
            }
            if (invitationChanges.length > 0) {
              await core.updateInvitationVaultAccess(workspaceId, member.invitationId!, {
                changes: invitationChanges,
              });
            }
            await onSaved();
            onClose();
            return;
          }

          if (roleId !== initialRoleId && roleId && !isOwner) {
            await core.updateWorkspaceMember(workspaceId, member.userId!, { roleId });
          }

          const changes: MemberVaultAccessUpdateRequestDto["changes"] = [];
          for (const vault of vaultAccess) {
            const before = initialVaultAccess[vault.vaultId] ?? null;
            const after = accessByVaultId[vault.vaultId] ?? null;
            if (before === after) {
              continue;
            }

            if (!before && after) {
              if (!accountVaultKey) {
                throw new Error(t("web.workspaceSettings.vaults.errors.unlockRequired"));
              }
              const currentWrapped = await core.getVaultKey(vault.vaultId);
              const bundle = readVaultBundle(userId);
              if (!bundle) {
                throw new Error(t("web.workspaceSettings.vaults.errors.unlockRequired"));
              }
              const identity = await decryptUserIdentityFromEncryptedBlob(
                accountVaultKey,
                bundle.encrypted_private_key.payload,
              );
              const currentKey = await unwrapVaultKeyForSelf({
                encryptedVaultKey: currentWrapped.encryptedVaultKey,
                recipientPrivateKey: identity.ed25519SecretKey,
                recipientPqPrivateKey: identity.mlkem768DecapsulationKey,
              });
              const encryptedVaultKey = await wrapForUser(currentKey, member);
              changes.push({
                vaultId: vault.vaultId,
                profileId: after,
                encryptedVaultKey,
                baseVersion: 0,
              });
            } else if (before && !after) {
              const access = await core.getVaultAccess(vault.vaultId);
              const remaining = access.members.filter(
                (row) => row.userId !== member.userId && row.profileId,
              );
              const rotatedKey = await generateSharedVaultKey();
              const rotatedVaultKeys: Array<{ userId: string; encryptedVaultKey: EncryptedBlobDto }> =
                [];
              if (!accountVaultKey) {
                throw new Error(t("web.workspaceSettings.vaults.errors.unlockRequired"));
              }
              const bundle = readVaultBundle(userId);
              if (!bundle) {
                throw new Error(t("web.workspaceSettings.vaults.errors.unlockRequired"));
              }
              const identity = await decryptUserIdentityFromEncryptedBlob(
                accountVaultKey,
                bundle.encrypted_private_key.payload,
              );
              for (const row of remaining) {
                if (!row.publicPqKey) {
                  continue;
                }
                const wrapped = await wrapVaultKeyForRecipient({
                  vaultKey: rotatedKey,
                  recipientUserId: row.userId,
                  senderPrivateKey: identity.ed25519SecretKey,
                  recipientPublicKey: base64ToBytes(row.publicKey),
                  recipientPqPublicKey: base64ToBytes(row.publicPqKey),
                });
                rotatedVaultKeys.push({ userId: row.userId, encryptedVaultKey: wrapped });
              }
              const encryptedPayload = await createOpaqueVaultEventPayload("VAULT_ACCESS_UPDATE");
              changes.push({
                vaultId: vault.vaultId,
                profileId: null,
                rotatedVaultKeys,
                encryptedPayload,
                baseVersion: 0,
              });
            } else if (before && after) {
              changes.push({
                vaultId: vault.vaultId,
                profileId: after,
                baseVersion: 0,
              });
            }
          }

          if (changes.length > 0) {
            await core.updateMemberVaultAccess(workspaceId, member.userId!, { changes });
          }

          await onSaved();
          onClose();
        },
      );
    } catch {
      /* toast */
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!canDelete || isOwner) {
      return;
    }
    if (isPending) {
      if (!member.invitationId) {
        return;
      }
    } else if (!member.userId) {
      return;
    }

    setRemoving(true);
    try {
      await runSaveWithToast(
        {
          loading: isPending
            ? t("web.workspaceSettings.members.invite.revoking")
            : t("web.workspaceSettings.members.card.removing"),
          success: isPending
            ? t("web.workspaceSettings.members.invite.revoked")
            : t("web.workspaceSettings.members.card.removed"),
          error: t("web.toast.save.error"),
        },
        async () => {
          if (isPending) {
            await core.revokeWorkspaceInvitation(workspaceId, member.invitationId!);
          } else {
            await core.deleteWorkspaceMember(workspaceId, member.userId!);
          }
          await onSaved();
          setDeleteConfirmOpen(false);
          onClose();
        },
      );
    } catch {
      /* toast */
    } finally {
      setRemoving(false);
    }
  }

  const showActions = canDelete && !isOwner;
  const deleteMenuLabel = isPending
    ? t("web.workspaceSettings.members.deleteConfirm.deleteInvite")
    : t("web.workspaceSettings.members.deleteConfirm.deleteMember");

  const header = (
    <div className="flex min-w-0 items-center gap-3 pr-8">
      <h2 className="truncate text-lg font-semibold leading-7 text-foreground">
        {t("web.workspaceSettings.members.card.title")}
      </h2>
      {isPending ? (
        <span className="shrink-0 rounded-md bg-foreground px-2 py-0.5 text-sm font-normal leading-5 text-background">
          {t("web.workspaceSettings.members.pendingBadge")}
        </span>
      ) : null}
    </div>
  );

  const footer = (
    <div className="flex w-full items-center justify-between gap-2">
      {showActions ? (
        <VaultCardActionsMenu
          t={t}
          disabled={saving || removing}
          deleteLabel={deleteMenuLabel}
          onDelete={() => setDeleteConfirmOpen(true)}
        />
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" disabled={saving || removing} onClick={onClose}>
          {t("web.newItemPopup.cancel")}
        </Button>
        <Button
          type="button"
          disabled={!canPut || !dirty || saving || removing}
          onClick={() => void handleSave()}
        >
          {saving ? t("web.newItemPopup.saving") : t("web.workspaceSettings.save")}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Popup
        id={popupId}
        className="z-[60]"
        width={720}
        header={header}
        closeLabel={t("web.settingsPopup.close")}
        onClose={onClose}
        closeDisabled={saving || removing}
        footer={footer}
      >
        <div className="flex flex-col gap-6 pb-2">
          <div className="flex items-center gap-3">
            <MemberFavicon
              firstName={member.firstName}
              lastName={member.lastName}
              email={member.email}
              size={48}
            />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-foreground">{displayName}</p>
              <p className="truncate text-sm text-muted-foreground">{member.email}</p>
            </div>
          </div>

          <div className="flex flex-col">
            <InfoRow label={t("web.workspaceSettings.members.card.roleLabel")}>
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <Select
                  value={roleId}
                  disabled={!canPut || isOwner || saving}
                  variant="button"
                  buttonVariant="ghost"
                  buttonSize="sm"
                  onValueChange={setRoleId}
                >
                  <SelectTrigger className={cn("w-auto shrink-0", GHOST_SELECT_ROLE_ALIGN_CLASS)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(isOwner ? roles : assignableRoles).map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {localizedRoleLabel(role, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Link
                  to={settingsPath("roles")}
                  className="ms-auto inline-flex shrink-0 items-center gap-1 text-sm font-medium text-foreground hover:underline"
                >
                  <GearIcon className="size-4" />
                  {t("web.workspaceSettings.members.card.manageRoles")}
                </Link>
              </div>
            </InfoRow>

            <InfoRow label={t("web.workspaceSettings.members.card.invitation")}>
              <HistoryValue
                value={formatDateTime(member.invitedAt, locale)}
                actor={member.invitedBy}
                actorText={actorLabel(member.invitedBy)}
                onOpenActor={onOpenMember}
              />
            </InfoRow>

            <InfoRow label={t("web.workspaceSettings.members.card.roleChange")}>
              <HistoryValue
                value={formatDateTime(member.roleChangedAt, locale)}
                actor={member.roleChangedBy}
                actorText={actorLabel(member.roleChangedBy)}
                onOpenActor={onOpenMember}
              />
            </InfoRow>

            <InfoRow label={t("web.workspaceSettings.members.card.joinDate")}>
              <p className="text-sm text-muted-foreground">
                {formatDateTime(member.joinedAt, locale)}
                {member.joinedAt ? ` (${formatRelativeDays(member.joinedAt, t)})` : null}
              </p>
            </InfoRow>

            <InfoRow label={t("web.workspaceSettings.members.card.lastLogin")} isLast>
              <p className="text-sm text-muted-foreground">
                {formatDateTime(member.lastLoginAt, locale)}
                {member.lastLoginAt ? ` (${formatRelativeDays(member.lastLoginAt, t)})` : null}
              </p>
            </InfoRow>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="pb-2.5 text-sm font-medium text-foreground">
              {t("web.workspaceSettings.members.card.vaultsTitle")}
            </p>
            <div className="rounded-lg border border-border">
              <div
                className={cn(
                  "flex items-center gap-1 rounded-t-lg bg-secondary px-1 py-1 pe-2",
                  "border border-transparent",
                  "transition-[color,box-shadow,border-color]",
                  "focus-within:z-10 focus-within:border-accent focus-within:rounded-t-lg",
                  "focus-within:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
                )}
              >
                <div className="flex min-h-9 min-w-0 flex-1 items-center gap-2 px-3">
                  <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t("web.workspaceSettings.members.card.vaultsSearch")}
                    className={cn(
                      "h-9 border-0 px-0 outline-none transition-none",
                      "!bg-transparent !shadow-none",
                      "hover:!border-transparent hover:!bg-transparent hover:!shadow-none",
                      "focus:!border-transparent focus:!bg-transparent focus:!shadow-none",
                      "focus-visible:!border-transparent focus-visible:!bg-transparent focus-visible:!shadow-none focus-visible:!ring-0",
                    )}
                  />
                </div>
                <Select
                  value={accessFilter}
                  onValueChange={(value) => setAccessFilter(value as AccessFilterValue)}
                  variant="button"
                  buttonVariant="secondary"
                  buttonSize="sm"
                >
                  <SelectTrigger
                    className={cn(
                      "h-auto min-h-0 w-auto shrink-0 gap-2 px-3 py-1.5 shadow-none",
                      "bg-[color-mix(in_hsl,hsl(var(--secondary))_96%,hsl(var(--foreground))_4%)]",
                      "hover:bg-[color-mix(in_hsl,hsl(var(--secondary))_93%,hsl(var(--foreground))_7%)]",
                    )}
                  >
                    <FilterIcon className="size-4 shrink-0" />
                    <SelectValue>{filterLabel(accessFilter)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("web.workspaceSettings.vaults.access.filterAll", {
                        count: vaultAccess.length,
                      })}
                    </SelectItem>
                    <SelectItem value="with_access">
                      {t("web.workspaceSettings.vaults.access.filterWithAccess")}
                    </SelectItem>
                    <SelectItem value="without_access">
                      {t("web.workspaceSettings.vaults.access.filterWithoutAccess")}
                    </SelectItem>
                    {profiles.map((profile) => (
                      <SelectItem key={profile.id} value={`profile:${profile.id}`}>
                        {localizedProfileLabel(profile, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="max-h-[320px] overflow-y-auto">
                {loadingAccess ? (
                  <p className="flex h-16 items-center px-4 text-sm text-muted-foreground">
                    {t("web.workspaceSettings.members.loading")}
                  </p>
                ) : filteredVaults.length === 0 ? (
                  <p className="flex h-16 items-center px-4 text-sm text-muted-foreground">
                    {t("web.workspaceSettings.members.card.vaultsEmpty")}
                  </p>
                ) : (
                  filteredVaults.map((vault, index) => {
                    const value = accessByVaultId[vault.vaultId] ?? NO_ACCESS_VALUE;
                    return (
                      <div
                        key={vault.vaultId}
                        className={cn(
                          "flex items-center gap-4 px-4 py-4",
                          index > 0 && "border-t border-border",
                        )}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="text-base" aria-hidden>
                            {vault.icon || "📁"}
                          </span>
                          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                            {vault.name}
                          </p>
                        </div>
                        <Select
                          value={value}
                          disabled={!canPut || saving || isOwner}
                          variant="button"
                          buttonVariant="ghost"
                          buttonSize="sm"
                          onValueChange={(next) => {
                            setAccessByVaultId((current) => ({
                              ...current,
                              [vault.vaultId]: next === NO_ACCESS_VALUE ? null : next,
                            }));
                          }}
                        >
                          <SelectTrigger
                            className={cn("w-auto shrink-0", GHOST_SELECT_PROFILE_ALIGN_CLASS)}
                          >
                            <SelectValue>
                              {profileSelectLabel(value === NO_ACCESS_VALUE ? null : value)}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_ACCESS_VALUE}>
                              {t("web.workspaceSettings.vaults.access.noAccess")}
                            </SelectItem>
                            {profiles.map((profile) => (
                              <SelectItem key={profile.id} value={profile.id}>
                                {localizedProfileLabel(profile, t)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </Popup>

      <DeleteMemberConfirmPopup
        open={deleteConfirmOpen}
        pending={isPending}
        t={t}
        deleting={removing}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void handleRemove()}
      />
    </>
  );
}

function InfoRow({
  label,
  children,
  isLast = false,
}: {
  label: string;
  children: ReactNode;
  isLast?: boolean;
}) {
  return (
    <div className={cn("flex h-12 items-center gap-4", !isLast && "border-b border-border")}>
      <div className="w-[200px] shrink-0 text-sm font-medium text-foreground">{label}</div>
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
    </div>
  );
}

function HistoryValue({
  value,
  actor,
  actorText,
  onOpenActor,
}: {
  value: string;
  actor: WorkspaceMemberDto["invitedBy"];
  actorText: string;
  onOpenActor: (userId: string) => void;
}) {
  return (
    <p className="text-sm text-muted-foreground">
      {value}
      {actor ? (
        <>
          {", "}
          <button
            type="button"
            className="font-medium text-foreground underline underline-offset-2"
            onClick={() => onOpenActor(actor.userId)}
          >
            {actorText}
          </button>
        </>
      ) : null}
    </p>
  );
}
