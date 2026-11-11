import {
  ensureProfilePermissions,
  profileAllowsEntriesDelete,
  profileAllowsEntriesGet,
  profileAllowsEntriesPost,
  profileAllowsEntriesPut,
  type ProfilePermissions,
} from "@okkey/types";
import type { VaultsRepository } from "../storage/repositories.ts";

import type { VaultProfileWriteGuardRepository } from "./repository.ts";

export const PROFILE_PERMISSION_DENIED = "PROFILE_PERMISSION_DENIED";
export const ACCESS_DENIED = "ACCESS_DENIED";

export type VaultWriteAction =
  | "entries.post"
  | "entries.put"
  | "entries.delete"
  | "entries.get"
  | "vault.manage"
  | "deny";

export type SyncAppendGuardInput = {
  vaultId: string;
  userId: string;
  eventType: string;
  referencedItemId?: string | null;
  itemSoftDeleted?: boolean;
};

export type AttachmentGuardInput = {
  vaultId: string;
  userId: string;
  itemId: string;
  method: "GET" | "POST" | "DELETE";
};

export class VaultProfileWriteGuardError extends Error {
  readonly code: typeof PROFILE_PERMISSION_DENIED | typeof ACCESS_DENIED;
  readonly statusCode = 403;

  constructor(
    code: typeof PROFILE_PERMISSION_DENIED | typeof ACCESS_DENIED = PROFILE_PERMISSION_DENIED,
    message = code === ACCESS_DENIED ? "access denied" : "Profile permission denied",
  ) {
    super(message);
    this.name = "VaultProfileWriteGuardError";
    this.code = code;
  }
}

const MANAGE_EVENT_TYPES = new Set([
  "DEVICE_ADD",
  "DEVICE_REMOVE",
  "VAULT_CREATE",
  "VAULT_SHARE",
  "VAULT_KEY_ROTATION",
]);

/**
 * Map sync event types to profile actions.
 * Unknown / unlisted types are denied by default on shared vaults.
 */
export function resolveSyncWriteAction(input: {
  eventType: string;
  itemSoftDeleted?: boolean;
}): VaultWriteAction {
  const eventType = input.eventType.trim();
  if (eventType === "ITEM_CREATE") {
    return "entries.post";
  }
  if (eventType === "ITEM_DELETE") {
    return "entries.delete";
  }
  if (eventType === "ITEM_UPDATE") {
    return input.itemSoftDeleted === true ? "entries.delete" : "entries.put";
  }
  if (MANAGE_EVENT_TYPES.has(eventType)) {
    return "vault.manage";
  }
  return "deny";
}

export class VaultProfileWriteGuardService {
  private readonly profiles: VaultProfileWriteGuardRepository;
  private readonly vaults: Pick<
    VaultsRepository,
    "canManageVaultSettings" | "canReadVault"
  >;

  constructor(
    profiles: VaultProfileWriteGuardRepository,
    vaults: Pick<VaultsRepository, "canManageVaultSettings" | "canReadVault">,
  ) {
    this.profiles = profiles;
    this.vaults = vaults;
  }

  async assertSyncAppendAllowed(input: SyncAppendGuardInput): Promise<void> {
    const action = resolveSyncWriteAction({
      eventType: input.eventType,
      itemSoftDeleted: input.itemSoftDeleted,
    });

    await this.assertSharedVaultAction({
      vaultId: input.vaultId,
      userId: input.userId,
      action,
      itemId: input.referencedItemId ?? null,
      eventType: input.eventType,
    });
  }

  async assertAttachmentAllowed(input: AttachmentGuardInput): Promise<void> {
    // Download is a read → get.
    if (input.method === "GET") {
      await this.assertSharedVaultAction({
        vaultId: input.vaultId,
        userId: input.userId,
        action: "entries.get",
        itemId: input.itemId,
      });
      return;
    }

    // Clients upload attachments for a new item before ITEM_CREATE (New item / import).
    // Without a prior CREATE, treat upload as create-side write → entries.post.
    // Existing items keep entries.put (and require CREATE via assertSharedVaultAction).
    const creator =
      input.method === "POST"
        ? await this.profiles.findItemCreatorUserId(input.vaultId, input.itemId)
        : null;
    const action: VaultWriteAction =
      input.method === "POST" && creator == null ? "entries.post" : "entries.put";

    await this.assertSharedVaultAction({
      vaultId: input.vaultId,
      userId: input.userId,
      action,
      itemId: input.itemId,
    });
  }

  private async assertSharedVaultAction(input: {
    vaultId: string;
    userId: string;
    action: VaultWriteAction;
    itemId: string | null;
    eventType?: string;
  }): Promise<void> {
    const row = await this.profiles.findVaultProfile(input.vaultId, input.userId);
    if (!row) {
      // Missing vault: let Core return 404 / ACCESS_DENIED.
      return;
    }
    if (row.isPersonal) {
      return;
    }

    const canRead = await this.vaults.canReadVault(input.vaultId, input.userId);
    if (!canRead) {
      throw new VaultProfileWriteGuardError(ACCESS_DENIED);
    }

    if (input.action === "deny") {
      throw new VaultProfileWriteGuardError(
        PROFILE_PERMISSION_DENIED,
        "Event type is not allowed for this vault profile",
      );
    }

    if (input.action === "vault.manage") {
      const canManage = await this.vaults.canManageVaultSettings(
        input.vaultId,
        input.userId,
      );
      if (!canManage) {
        throw new VaultProfileWriteGuardError(
          PROFILE_PERMISSION_DENIED,
          "Vault manage events require owner or manager access",
        );
      }
      return;
    }

    if (!row.hasProfileAssignment || row.permissionsJson == null) {
      throw new VaultProfileWriteGuardError(
        PROFILE_PERMISSION_DENIED,
        "Shared vault writes require an assigned profile",
      );
    }

    const permissions: ProfilePermissions = ensureProfilePermissions(
      row.permissionsJson,
    );

    // ITEM_CREATE must not reuse an existing item id (own-scope / overwrite bypass).
    if (input.action === "entries.post" && input.itemId) {
      const existingCreator = await this.profiles.findItemCreatorUserId(
        input.vaultId,
        input.itemId,
      );
      if (existingCreator != null) {
        throw new VaultProfileWriteGuardError(
          PROFILE_PERMISSION_DENIED,
          "ITEM_CREATE is not allowed for an existing item id",
        );
      }
    }

    let itemCreatedByUserId: string | null = null;
    const needsOwnScope =
      input.action === "entries.put" ||
      input.action === "entries.delete" ||
      input.action === "entries.get";
    if (needsOwnScope && input.itemId) {
      itemCreatedByUserId = await this.profiles.findItemCreatorUserId(
        input.vaultId,
        input.itemId,
      );
    }

    // Put/delete require a prior ITEM_CREATE for this id — otherwise put-only
    // profiles could materialize or remove items that were never created.
    // Attachment uploads for brand-new items use entries.post instead (see assertAttachmentAllowed).
    if (
      (input.action === "entries.put" || input.action === "entries.delete") &&
      input.itemId &&
      itemCreatedByUserId == null
    ) {
      throw new VaultProfileWriteGuardError(
        PROFILE_PERMISSION_DENIED,
        "Put/delete require an existing ITEM_CREATE for this item id",
      );
    }

    const ctx = {
      permissions,
      userId: input.userId,
      itemCreatedByUserId,
    };

    const allowed =
      input.action === "entries.post"
        ? profileAllowsEntriesPost(ctx)
        : input.action === "entries.put"
          ? profileAllowsEntriesPut(ctx)
          : input.action === "entries.delete"
            ? profileAllowsEntriesDelete(ctx)
            : profileAllowsEntriesGet(ctx);

    if (!allowed) {
      throw new VaultProfileWriteGuardError(PROFILE_PERMISSION_DENIED);
    }
  }
}
