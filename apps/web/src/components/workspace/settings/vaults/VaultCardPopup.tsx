import type {
  EncryptedBlobDto,
  Vault,
  VaultAccessUpdateRequestDto,
  VaultCreateRequestDto,
  WorkspaceMemberDto,
  WorkspaceProfileSummary,
} from "@okkey/types";
import type { CoreClient } from "@okkey/api";
import {
  createOpaqueVaultEventPayload,
  decryptUserIdentityFromEncryptedBlob,
  generateSharedVaultKey,
  unwrapVaultKeyForSelf,
  wrapVaultKeyForRecipient,
} from "@okkey/crypto";
import {
  Button,
  Input,
  KeyField,
  KeyForm,
  KeySection,
  Popup,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  getKeyFieldSurfaceRounding,
  cn,
} from "@okkey/ui";
import { useEffect, useMemo, useState } from "react";

import ExitNewItemFormConfirmPopup from "../../../items/ExitNewItemFormConfirmPopup";
import { readVaultBundle } from "../../../../auth/localVaultBundle";
import { base64ToBytes } from "../../../../auth/base64";
import { runSaveWithToast } from "../../../../lib/saveWithToast";

import DeleteVaultConfirmPopup from "./DeleteVaultConfirmPopup";
import {
  GHOST_SELECT_PROFILE_ALIGN_CLASS,
  localizedProfileLabel,
} from "../localizedWorkspaceLabels";
import VaultCardActionsMenu, {
  MemberFavicon,
  memberDisplayName,
  useFilteredMembers,
  type AccessFilterValue,
} from "./vaultAccessHelpers";
import VaultIconPicker from "./VaultIconPicker";
import {
  DEFAULT_PERSONAL_VAULT_ICON,
  DEFAULT_SHARED_VAULT_ICON,
  normalizeVaultIcon,
} from "./vaultIcons";

const NO_ACCESS_VALUE = "__none__";

export type VaultCardDraft = {
  name: string;
  description: string;
  icon: string;
  /** userId → profileId | null (null = no access) */
  accessByUserId: Record<string, string | null>;
};

type VaultCardPopupProps = {
  popupId: string;
  mode: "personal" | "shared";
  initialVault?: Vault;
  workspaceId: string;
  core: CoreClient;
  userId: string;
  accountVaultKey: Uint8Array | null;
  members: readonly WorkspaceMemberDto[];
  profiles: readonly WorkspaceProfileSummary[];
  initialAccessByUserId?: Record<string, string | null>;
  t: (key: string, values?: Record<string, string | number>) => string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

function emptyDraft(mode: "personal" | "shared"): VaultCardDraft {
  return {
    name: "",
    description: "",
    icon: mode === "personal" ? DEFAULT_PERSONAL_VAULT_ICON : DEFAULT_SHARED_VAULT_ICON,
    accessByUserId: {},
  };
}

function draftFromVault(
  vault: Vault,
  mode: "personal" | "shared",
  accessByUserId: Record<string, string | null>,
  personalDefaultDescription: string,
): VaultCardDraft {
  const storedDescription = vault.description?.trim() ?? "";
  return {
    name: vault.name,
    description:
      storedDescription.length > 0
        ? storedDescription
        : mode === "personal"
          ? personalDefaultDescription
          : "",
    icon: normalizeVaultIcon(
      vault.icon,
      mode === "personal" ? DEFAULT_PERSONAL_VAULT_ICON : DEFAULT_SHARED_VAULT_ICON,
    ),
    accessByUserId: { ...accessByUserId },
  };
}

function isDraftDirty(
  draft: VaultCardDraft,
  initial: VaultCardDraft,
  includeAccess: boolean,
): boolean {
  if (
    draft.name !== initial.name ||
    draft.description !== initial.description ||
    draft.icon !== initial.icon
  ) {
    return true;
  }
  if (!includeAccess) {
    return false;
  }
  const keys = new Set([
    ...Object.keys(draft.accessByUserId),
    ...Object.keys(initial.accessByUserId),
  ]);
  for (const key of keys) {
    if ((draft.accessByUserId[key] ?? null) !== (initial.accessByUserId[key] ?? null)) {
      return true;
    }
  }
  return false;
}

function memberAccessKey(member: WorkspaceMemberDto): string | null {
  return member.userId ?? member.invitationId;
}

function isLockedMember(member: WorkspaceMemberDto, workspaceOwnerId: string | null): boolean {
  if (member.status === "pending" || !member.userId) {
    return false;
  }
  if (member.userId === workspaceOwnerId) {
    return true;
  }
  return member.roleBuiltinKey === "owner" || member.roleBuiltinKey === "admin";
}

export default function VaultCardPopup({
  popupId,
  mode,
  initialVault,
  workspaceId,
  core,
  userId,
  accountVaultKey,
  members,
  profiles,
  initialAccessByUserId = {},
  t,
  onClose,
  onSaved,
}: VaultCardPopupProps) {
  const isEditMode = Boolean(initialVault);
  const isPersonal = mode === "personal";
  const includeAccess = !isPersonal;

  const extendedProfileId = useMemo(
    () => profiles.find((profile) => profile.builtinId === "extended")?.id ?? null,
    [profiles],
  );

  const workspaceOwnerId = useMemo(() => {
    const owner = members.find((member) => member.roleBuiltinKey === "owner");
    return owner?.userId ?? null;
  }, [members]);

  const personalDefaultDescription = t("web.workspaceSettings.vaults.personal.description");

  const [draft, setDraft] = useState<VaultCardDraft>(() =>
    initialVault
      ? draftFromVault(initialVault, mode, initialAccessByUserId, personalDefaultDescription)
      : emptyDraft(mode),
  );
  const [initialSnapshot, setInitialSnapshot] = useState<VaultCardDraft>(() =>
    initialVault
      ? draftFromVault(initialVault, mode, initialAccessByUserId, personalDefaultDescription)
      : emptyDraft(mode),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [accessFilter, setAccessFilter] = useState<AccessFilterValue>("all");

  useEffect(() => {
    const next = initialVault
      ? draftFromVault(initialVault, mode, initialAccessByUserId, personalDefaultDescription)
      : emptyDraft(mode);
    // Seed defaults for create: owner/admin → extended, others → none
    if (!initialVault && includeAccess && extendedProfileId) {
      const access: Record<string, string | null> = {};
      for (const member of members) {
        if (!member.userId) {
          continue;
        }
        access[member.userId] = isLockedMember(member, workspaceOwnerId)
          ? extendedProfileId
          : null;
      }
      // Creator always extended
      access[userId] = extendedProfileId;
      next.accessByUserId = access;
    }
    setDraft(next);
    setInitialSnapshot(next);
    setSaveError(null);
    setExitConfirmOpen(false);
    setDeleteConfirmOpen(false);
    setSearchQuery("");
    setAccessFilter("all");
  }, [
    initialVault,
    initialAccessByUserId,
    mode,
    popupId,
    includeAccess,
    extendedProfileId,
    members,
    workspaceOwnerId,
    userId,
    personalDefaultDescription,
  ]);

  const accessMembers = useMemo(
    () =>
      members.flatMap((member) => {
        const key = memberAccessKey(member);
        if (!key) {
          return [];
        }
        return [
          {
            ...member,
            accessKey: key,
            userId: key,
            profileId: draft.accessByUserId[key] ?? null,
          },
        ];
      }),
    [members, draft.accessByUserId],
  );

  const filteredMembers = useFilteredMembers(accessMembers, searchQuery, accessFilter);

  const descriptionSurfaceRounding = useMemo(
    () =>
      getKeyFieldSurfaceRounding({
        mode: "edit",
        sectionVariant: "primary",
        fieldIndex: 0,
        fieldsCount: 1,
        canAddField: false,
      }),
    [],
  );

  const canSave = draft.name.trim().length > 0 && !saving;
  const dirty = isDraftDirty(draft, initialSnapshot, includeAccess);

  function requestClose() {
    if (dirty) {
      setExitConfirmOpen(true);
      return false;
    }
    return true;
  }

  function handleClose() {
    if (requestClose()) {
      onClose();
    }
  }

  async function wrapForMembers(
    vaultKey: Uint8Array,
    targetUserIds: string[],
  ): Promise<Map<string, EncryptedBlobDto>> {
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
    const out = new Map<string, EncryptedBlobDto>();
    for (const targetUserId of targetUserIds) {
      const member = members.find((row) => row.userId === targetUserId);
      if (!member?.publicPqKey) {
        throw new Error(t("web.workspaceSettings.vaults.errors.memberKeysMissing"));
      }
      const wrapped = await wrapVaultKeyForRecipient({
        vaultKey,
        recipientUserId: targetUserId,
        senderPrivateKey: identity.ed25519SecretKey,
        recipientPublicKey: base64ToBytes(member.publicKey),
        recipientPqPublicKey: base64ToBytes(member.publicPqKey),
      });
      out.set(targetUserId, wrapped);
    }
    return out;
  }

  async function handleSave() {
    if (!canSave) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await runSaveWithToast(
        {
          loading: t("web.toast.save.loading"),
          success: t("web.toast.save.success"),
          error: t("web.toast.save.error"),
        },
        async () => {
          if (isPersonal && initialVault) {
            await core.updateVault(initialVault.id, {
              name: draft.name.trim(),
              description: draft.description.trim(),
              icon: draft.icon,
            });
          } else if (!isEditMode) {
            if (!extendedProfileId) {
              throw new Error(t("web.workspaceSettings.vaults.errors.profilesMissing"));
            }
            const vaultKey = await generateSharedVaultKey();
            const invitationIds = new Set(
              members
                .filter((member) => member.status === "pending" && member.invitationId)
                .map((member) => member.invitationId!),
            );
            const withAccess = Object.entries(draft.accessByUserId)
              .filter(([memberId, profileId]) => Boolean(profileId) && !invitationIds.has(memberId))
              .map(([memberId, profileId]) => ({ userId: memberId, profileId: profileId! }));
            if (!withAccess.some((row) => row.userId === userId)) {
              withAccess.push({ userId, profileId: extendedProfileId });
            }
            const wraps = await wrapForMembers(
              vaultKey,
              withAccess.map((row) => row.userId),
            );
            const encryptedPayload = await createOpaqueVaultEventPayload("VAULT_CREATE");
            const body: VaultCreateRequestDto = {
              name: draft.name.trim(),
              description: draft.description.trim(),
              icon: draft.icon,
              encryptedPayload,
              baseVersion: 0,
              members: withAccess.map((row) => ({
                userId: row.userId,
                profileId: row.profileId,
                encryptedVaultKey: wraps.get(row.userId)!,
                role: row.userId === userId ? "owner" : "member",
              })),
            };
            const created = await core.createWorkspaceVault(workspaceId, body);
            const invitationUpdates = Object.entries(draft.accessByUserId)
              .filter(([memberId, profileId]) => invitationIds.has(memberId) && Boolean(profileId))
              .map(([invitationId, profileId]) => ({
                invitationId,
                profileId: profileId!,
              }));
            if (invitationUpdates.length > 0) {
              await core.updateVaultAccess(created.id, {
                grants: [],
                profileUpdates: [],
                revokes: [],
                invitationUpdates,
                baseVersion: 0,
              });
            }
          } else if (initialVault) {
            await core.updateVault(initialVault.id, {
              name: draft.name.trim(),
              description: draft.description.trim(),
              icon: draft.icon,
            });

            if (includeAccess) {
              const prev = initialSnapshot.accessByUserId;
              const next = draft.accessByUserId;
              const invitationIds = new Set(
                members
                  .filter((member) => member.status === "pending" && member.invitationId)
                  .map((member) => member.invitationId!),
              );
              const grants: VaultAccessUpdateRequestDto["grants"] = [];
              const profileUpdates: VaultAccessUpdateRequestDto["profileUpdates"] = [];
              const revokes: VaultAccessUpdateRequestDto["revokes"] = [];
              const invitationUpdates: NonNullable<
                VaultAccessUpdateRequestDto["invitationUpdates"]
              > = [];

              const allIds = new Set([...Object.keys(prev), ...Object.keys(next)]);
              for (const memberId of allIds) {
                const before = prev[memberId] ?? null;
                const after = next[memberId] ?? null;
                if (before === after) {
                  continue;
                }
                if (invitationIds.has(memberId)) {
                  invitationUpdates.push({ invitationId: memberId, profileId: after });
                  continue;
                }
                if (!before && after) {
                  grants.push({
                    userId: memberId,
                    profileId: after,
                    role: "member",
                    encryptedVaultKey: {
                      crypto_version: 2,
                      algorithm: "opaque",
                      payload: "",
                      meta: {},
                    },
                  });
                } else if (before && !after) {
                  revokes.push({ userId: memberId });
                } else if (before && after) {
                  profileUpdates.push({ userId: memberId, profileId: after });
                }
              }

              if (
                grants.length > 0 ||
                revokes.length > 0 ||
                profileUpdates.length > 0 ||
                invitationUpdates.length > 0
              ) {
                const remainingIds = Object.entries(next)
                  .filter(([id, profileId]) => Boolean(profileId) && !invitationIds.has(id))
                  .map(([id]) => id);

                let wraps: Map<string, EncryptedBlobDto>;
                if (revokes.length > 0) {
                  const rotatedKey = await generateSharedVaultKey();
                  wraps = await wrapForMembers(
                    rotatedKey,
                    Array.from(new Set([...remainingIds, ...grants.map((g) => g.userId)])),
                  );
                } else if (grants.length > 0) {
                  if (!accountVaultKey) {
                    throw new Error(t("web.workspaceSettings.vaults.errors.unlockRequired"));
                  }
                  const currentWrapped = await core.getVaultKey(initialVault.id);
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
                  wraps = await wrapForMembers(
                    currentKey,
                    grants.map((g) => g.userId),
                  );
                } else {
                  wraps = new Map();
                }

                for (const grant of grants) {
                  const wrapped = wraps.get(grant.userId);
                  if (!wrapped) {
                    throw new Error(t("web.workspaceSettings.vaults.errors.memberKeysMissing"));
                  }
                  grant.encryptedVaultKey = wrapped;
                }

                const encryptedPayload =
                  revokes.length > 0
                    ? await createOpaqueVaultEventPayload("VAULT_ACCESS_UPDATE")
                    : undefined;
                await core.updateVaultAccess(initialVault.id, {
                  grants,
                  profileUpdates,
                  revokes,
                  invitationUpdates,
                  rotatedVaultKeys:
                    revokes.length > 0
                      ? remainingIds.map((id) => ({
                          userId: id,
                          encryptedVaultKey: wraps.get(id)!,
                        }))
                      : undefined,
                  encryptedPayload,
                  baseVersion: 0,
                });
              }
            }
          }

          await onSaved();
        },
      );
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("web.toast.save.error"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initialVault || isPersonal) {
      return;
    }
    setDeleting(true);
    try {
      await runSaveWithToast(
        {
          loading: t("web.toast.save.loading"),
          success: t("web.toast.save.success"),
          error: t("web.toast.save.error"),
        },
        async () => {
          await core.deleteVault(initialVault.id);
          await onSaved();
        },
      );
      setDeleteConfirmOpen(false);
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("web.toast.save.error"));
    } finally {
      setDeleting(false);
    }
  }

  const filterLabel = (value: AccessFilterValue): string => {
    if (value === "all") {
      return t("web.workspaceSettings.vaults.access.filterAll", { count: members.length });
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

  const footer = (
    <div className="flex w-full items-center justify-between gap-2">
      {isEditMode && !isPersonal ? (
        <VaultCardActionsMenu
          t={t}
          disabled={saving || deleting}
          onDelete={() => setDeleteConfirmOpen(true)}
        />
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
          {t("web.newItemPopup.cancel")}
        </Button>
        <Button type="button" onClick={() => void handleSave()} disabled={!canSave}>
          {saving ? t("web.newItemPopup.saving") : t("web.workspaceSettings.save")}
        </Button>
      </div>
    </div>
  );

  const headerTitle = isEditMode
    ? t("web.workspaceSettings.vaults.card.editTitle")
    : t("web.workspaceSettings.vaults.card.createTitle");

  const kindLabel = isPersonal
    ? t("web.workspaceSettings.vaults.card.personalSubtitle")
    : t("web.workspaceSettings.vaults.card.sharedSubtitle");

  const popupHeader = (
    <div className="flex min-w-0 items-center gap-3">
      <h2 className="truncate text-lg font-semibold leading-7 text-foreground">{headerTitle}</h2>
      <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-sm font-normal leading-5 text-muted-foreground">
        {kindLabel}
      </span>
    </div>
  );

  return (
    <>
      <Popup
        id={popupId}
        className="z-[60]"
        width={720}
        header={popupHeader}
        closeLabel={t("web.settingsPopup.close")}
        onClose={onClose}
        onCloseRequest={requestClose}
        closeDisabled={saving}
        panelClassName="min-h-0"
        contentClassName="overflow-visible pt-2"
        footer={footer}
      >
        <div className="flex w-full flex-col gap-6 pb-2">
          <div className="flex flex-col gap-4 px-px pt-1">
            <div className="flex items-center gap-4">
              <VaultIconPicker
                value={draft.icon}
                onChange={(icon) => setDraft((current) => ({ ...current, icon }))}
                label={t("web.workspaceSettings.vaults.card.iconLabel")}
                disabled={saving}
              />
              <Input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
                placeholder={t("web.workspaceSettings.vaults.card.namePlaceholder")}
                className="h-10 min-w-0 flex-1 text-xl font-semibold leading-6"
                disabled={saving}
                aria-label={t("web.workspaceSettings.vaults.card.nameLabel")}
              />
            </div>

            <KeyForm mode="edit" className="gap-0">
              <KeySection variant="primary" mode="edit" className="overflow-visible">
                <KeyField
                  label={t("web.workspaceSettings.vaults.card.descriptionLabel")}
                  mode="edit"
                  editableValue
                  multilineValue
                  value={draft.description}
                  onValueChange={(description) =>
                    setDraft((current) => ({ ...current, description }))
                  }
                  surfaceRounding={descriptionSurfaceRounding}
                  className="!border-b-transparent"
                />
              </KeySection>
            </KeyForm>
          </div>

          {includeAccess ? (
            <div className="flex flex-col gap-1.5">
              <p className="pb-2.5 text-sm font-medium text-foreground">
                {t("web.workspaceSettings.vaults.access.title")}
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
                      placeholder={t("web.workspaceSettings.vaults.access.searchPlaceholder")}
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
                          count: members.length,
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
                  {filteredMembers.length === 0 ? (
                    <p className="flex h-16 items-center px-4 text-sm text-muted-foreground">
                      {t("web.workspaceSettings.vaults.access.empty")}
                    </p>
                  ) : (
                    filteredMembers.map((member, index) => {
                    const locked = isLockedMember(member, workspaceOwnerId);
                    const name = memberDisplayName(member);
                    const showName = name.trim().length > 0 && name !== member.email;
                    const profileValue = member.profileId ?? NO_ACCESS_VALUE;
                    const selectedProfile =
                      profileValue === NO_ACCESS_VALUE
                        ? null
                        : profiles.find((profile) => profile.id === profileValue) ?? null;
                    return (
                      <div
                        key={member.accessKey}
                        className={cn(
                          "flex items-center gap-4 px-4 py-4",
                          index > 0 && "border-t border-border",
                        )}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <MemberFavicon
                            firstName={member.firstName}
                            lastName={member.lastName}
                            email={member.email}
                            size={32}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <p className="min-w-0 truncate text-sm font-semibold leading-5 text-foreground">
                                {showName ? name : member.email}
                              </p>
                              {member.status === "pending" ? (
                                <span
                                  className={cn(
                                    "relative isolate shrink-0 px-2 text-xs font-normal leading-5 text-background",
                                    "before:absolute before:inset-0 before:-z-10 before:rounded-md before:bg-foreground",
                                  )}
                                >
                                  {t("web.workspaceSettings.members.pendingBadge")}
                                </span>
                              ) : null}
                            </div>
                            <p className="truncate text-xs leading-4 text-muted-foreground">
                              {showName ? member.email : "\u00a0"}
                            </p>
                          </div>
                        </div>
                        <Select
                          value={profileValue}
                          disabled={locked || saving}
                          variant="button"
                          buttonVariant="ghost"
                          buttonSize="sm"
                          onValueChange={(value) => {
                            const profileId = value === NO_ACCESS_VALUE ? null : value;
                            setDraft((current) => ({
                              ...current,
                              accessByUserId: {
                                ...current.accessByUserId,
                                [member.accessKey]: profileId,
                              },
                            }));
                          }}
                        >
                          <SelectTrigger
                            className={cn(
                              "w-auto shrink-0",
                              GHOST_SELECT_PROFILE_ALIGN_CLASS,
                              locked && "text-muted-foreground",
                            )}
                          >
                            <SelectValue>
                              {selectedProfile
                                ? localizedProfileLabel(selectedProfile, t)
                                : t("web.workspaceSettings.vaults.access.noAccess")}
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
          ) : isPersonal ? (
            <div className="flex flex-col gap-1.5 px-px">
              <p className="pb-2.5 text-sm font-medium text-foreground">
                {t("web.workspaceSettings.vaults.access.title")}
              </p>
              <p className="text-sm leading-5 text-muted-foreground">
                {t("web.workspaceSettings.vaults.card.personalAccessNote")}
              </p>
            </div>
          ) : null}

          {saveError ? <p className="px-px text-sm text-destructive">{saveError}</p> : null}
        </div>
      </Popup>

      <ExitNewItemFormConfirmPopup
        open={exitConfirmOpen}
        t={t}
        onClose={() => setExitConfirmOpen(false)}
        onConfirm={() => {
          setExitConfirmOpen(false);
          onClose();
        }}
      />

      <DeleteVaultConfirmPopup
        open={deleteConfirmOpen}
        t={t}
        deleting={deleting}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void handleDelete()}
      />
    </>
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
