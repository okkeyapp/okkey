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
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { readVaultBundle } from "../../../../auth/localVaultBundle";
import { base64ToBytes } from "../../../../auth/base64";
import { runSaveWithToast } from "../../../../lib/saveWithToast";
import { settingsPath } from "../../../../routes/paths";
import { memberDisplayName, memberInitials } from "../vaults/vaultAccessHelpers";

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
  const isOwner = member.roleBuiltinKey === "owner";
  const displayName = memberDisplayName(member);
  const initials = memberInitials(displayName);

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
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    setRoleId(member.roleId ?? "");
    setInitialRoleId(member.roleId ?? "");
    setSearchQuery("");
  }, [member]);

  useEffect(() => {
    if (!member.userId) {
      return;
    }
    let cancelled = false;
    setLoadingAccess(true);
    void (async () => {
      try {
        const response = await core.getMemberVaultAccess(workspaceId, member.userId!);
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
  }, [core, workspaceId, member.userId]);

  const filteredVaults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return vaultAccess;
    }
    return vaultAccess.filter((vault) => vault.name.toLowerCase().includes(q));
  }, [vaultAccess, searchQuery]);

  const dirty =
    roleId !== initialRoleId ||
    vaultAccess.some(
      (vault) => (accessByVaultId[vault.vaultId] ?? null) !== (initialVaultAccess[vault.vaultId] ?? null),
    );

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
    if (!canPut || !member.userId || !dirty) {
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
              const remaining = access.members.filter((row) => row.userId !== member.userId && row.profileId);
              const rotatedKey = await generateSharedVaultKey();
              const rotatedVaultKeys: Array<{ userId: string; encryptedVaultKey: EncryptedBlobDto }> = [];
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
    if (!canDelete || !member.userId || isOwner) {
      return;
    }
    setRemoving(true);
    try {
      await runSaveWithToast(
        {
          loading: t("web.workspaceSettings.members.card.removing"),
          success: t("web.workspaceSettings.members.card.removed"),
          error: t("web.toast.save.error"),
        },
        async () => {
          await core.deleteWorkspaceMember(workspaceId, member.userId!);
          await onSaved();
          onClose();
        },
      );
    } catch {
      /* toast */
    } finally {
      setRemoving(false);
    }
  }

  const header = (
    <div className="pr-8">
      <h2 className="text-lg font-semibold text-foreground">
        {t("web.workspaceSettings.members.card.title")}
      </h2>
    </div>
  );

  const footer = (
    <div className="flex w-full items-center justify-between gap-2">
      <div>
        {canDelete && !isOwner ? (
          <Button
            type="button"
            variant="destructive"
            disabled={saving || removing}
            onClick={() => void handleRemove()}
          >
            {t("web.workspaceSettings.members.card.remove")}
          </Button>
        ) : null}
      </div>
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
          <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-secondary text-sm font-semibold text-foreground">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-foreground">{displayName}</p>
            <p className="truncate text-sm text-muted-foreground">{member.email}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-foreground">
            {t("web.workspaceSettings.members.card.roleLabel")}
          </label>
          <Select
            value={roleId}
            disabled={!canPut || isOwner || saving}
            onValueChange={setRoleId}
          >
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(isOwner ? roles : assignableRoles).map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Link
            to={settingsPath("roles")}
            className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline"
          >
            <GearIcon className="size-4" />
            {t("web.workspaceSettings.members.card.manageRoles")}
          </Link>
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <HistoryLine
            label={t("web.workspaceSettings.members.card.invitation")}
            value={formatDateTime(member.invitedAt, locale)}
            actor={member.invitedBy}
            actorText={actorLabel(member.invitedBy)}
            onOpenActor={onOpenMember}
          />
          <HistoryLine
            label={t("web.workspaceSettings.members.card.roleChange")}
            value={formatDateTime(member.roleChangedAt, locale)}
            actor={member.roleChangedBy}
            actorText={actorLabel(member.roleChangedBy)}
            onOpenActor={onOpenMember}
          />
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">
              {t("web.workspaceSettings.members.card.joinDate")}:
            </span>{" "}
            {formatDateTime(member.joinedAt, locale)}
            {member.joinedAt
              ? ` (${formatRelativeDays(member.joinedAt, t)})`
              : null}
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">
              {t("web.workspaceSettings.members.card.lastLogin")}:
            </span>{" "}
            {formatDateTime(member.lastLoginAt, locale)}
            {member.lastLoginAt
              ? ` (${formatRelativeDays(member.lastLoginAt, t)})`
              : null}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-foreground">
            {t("web.workspaceSettings.members.card.vaultsTitle")}
          </h3>
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("web.workspaceSettings.members.card.vaultsSearch")}
            className="h-9"
          />
          {loadingAccess ? (
            <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.members.loading")}</p>
          ) : filteredVaults.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("web.workspaceSettings.members.card.vaultsEmpty")}
            </p>
          ) : (
            <div className="flex flex-col">
              {filteredVaults.map((vault, index) => {
                const isFirst = index === 0;
                const isLast = index === filteredVaults.length - 1;
                const value = accessByVaultId[vault.vaultId] ?? NO_ACCESS_VALUE;
                return (
                  <div
                    key={vault.vaultId}
                    className={cn(
                      "flex items-center gap-3 border border-border px-3 py-3",
                      isFirst && "rounded-t-lg",
                      isLast && "rounded-b-lg",
                      !isFirst && "-mt-px",
                    )}
                  >
                    <span className="text-base" aria-hidden>
                      {vault.icon || "📁"}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {vault.name}
                    </p>
                    <Select
                      value={value}
                      disabled={!canPut || saving || isOwner}
                      onValueChange={(next) => {
                        setAccessByVaultId((current) => ({
                          ...current,
                          [vault.vaultId]: next === NO_ACCESS_VALUE ? null : next,
                        }));
                      }}
                    >
                      <SelectTrigger className="h-9 w-[160px] shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_ACCESS_VALUE}>
                          {t("web.workspaceSettings.vaults.access.noAccess")}
                        </SelectItem>
                        {profiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            {profile.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Popup>
  );
}

function HistoryLine({
  label,
  value,
  actor,
  actorText,
  onOpenActor,
}: {
  label: string;
  value: string;
  actor: WorkspaceMemberDto["invitedBy"];
  actorText: string;
  onOpenActor: (userId: string) => void;
}) {
  return (
    <p className="text-muted-foreground">
      <span className="font-medium text-foreground">{label}:</span> {value}
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
