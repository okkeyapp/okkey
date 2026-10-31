import type { KeyFieldFileStorage } from "../storage/key-field-file-storage.ts";
import type { AttachmentsRepository, AttachmentRecord } from "../storage/attachments.ts";
import type { EventsRepository, VaultsRepository, WorkspacesRepository } from "../storage/repositories.ts";
import type { VaultItemSoftDeletesRepository } from "../storage/vault-item-soft-deletes.ts";
import type { WorkspaceItemTemplatesRepository } from "../storage/workspace-item-templates.ts";
import {
  DEFAULT_MAX_FILE_SIZE_MB,
  maxFileSizeBytesFromMb,
  normalizeFileExtensionTag,
} from "@okkey/types";
import type { PlanEntitlementRuntimeConfig } from "../plan-entitlements.ts";
import { workspaceHasPlanFeature } from "../plan-entitlements.ts";

export class AttachmentServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

/** Explicit client marker for record/template website icons (not keyed by file name). */
export const ATTACHMENT_PURPOSE_ITEM_FAVICON = "item-favicon" as const;

export type AttachmentUploadPurpose = typeof ATTACHMENT_PURPOSE_ITEM_FAVICON;

export interface AttachmentUploadInput {
  vaultId: string;
  itemId: string;
  userId: string;
  fileName: string;
  mimeType: string;
  encryptedBody: Uint8Array;
  encryptedKey: Uint8Array;
  sizeBytes: number;
  /** When set to item-favicon, skip files-in-items and workspace attachment size limits. */
  purpose?: AttachmentUploadPurpose;
}

export interface AttachmentUploadResult {
  attachmentId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface AttachmentDownloadResult {
  record: AttachmentRecord;
  encryptedBody: Uint8Array;
  name: string;
  mimeType: string;
}

export interface AttachmentServiceDeps {
  storage: KeyFieldFileStorage;
  attachments: AttachmentsRepository;
  vaults: Pick<VaultsRepository, "canReadVault" | "findById">;
  workspaces: Pick<WorkspacesRepository, "findById">;
  events: Pick<EventsRepository, "hasReferencedItemId">;
  softDeletes: Pick<VaultItemSoftDeletesRepository, "exists">;
  templates: Pick<WorkspaceItemTemplatesRepository, "findById">;
  config: PlanEntitlementRuntimeConfig;
  /** True when the actor may update workspace branding (logo / tile color). */
  canUpdateWorkspaceBranding: (workspaceId: string, userId: string) => Promise<boolean>;
}

const ENCRYPTED_BODY_SIZE_OVERHEAD_BYTES = 1024 * 1024;

export class AttachmentService {
  private readonly storage: KeyFieldFileStorage;
  private readonly attachments: AttachmentsRepository;
  private readonly vaults: Pick<VaultsRepository, "canReadVault" | "findById">;
  private readonly workspaces: Pick<WorkspacesRepository, "findById">;
  private readonly events: Pick<EventsRepository, "hasReferencedItemId">;
  private readonly softDeletes: Pick<VaultItemSoftDeletesRepository, "exists">;
  private readonly templates: Pick<WorkspaceItemTemplatesRepository, "findById">;
  private readonly config: PlanEntitlementRuntimeConfig;
  private readonly canUpdateWorkspaceBranding: (
    workspaceId: string,
    userId: string,
  ) => Promise<boolean>;

  constructor(deps: AttachmentServiceDeps) {
    this.storage = deps.storage;
    this.attachments = deps.attachments;
    this.vaults = deps.vaults;
    this.workspaces = deps.workspaces;
    this.events = deps.events;
    this.softDeletes = deps.softDeletes;
    this.templates = deps.templates;
    this.config = deps.config;
    this.canUpdateWorkspaceBranding = deps.canUpdateWorkspaceBranding;
  }

  async upload(input: AttachmentUploadInput): Promise<AttachmentUploadResult> {
    await this.assertVaultAccess(input.vaultId, input.userId);

    const uploadLimits = await this.resolveUploadLimits(input.vaultId, input.itemId, input.userId);
    // Record favicons persist on any plan via an explicit purpose header — not file name.
    const isItemFaviconAttachment = input.purpose === ATTACHMENT_PURPOSE_ITEM_FAVICON;

    // Workspace branding logo uses workspaceId as a synthetic item id on the logo vault;
    // that path must stay available when "files in items" is disabled for regular uploads.
    // Item favicon purpose uploads are also exempt (website icons are not "files in items").
    if (
      !uploadLimits.filesInItemsEnabled &&
      !uploadLimits.isWorkspaceLogoAttachment &&
      !isItemFaviconAttachment
    ) {
      throw new AttachmentServiceError(
        "FILES_IN_ITEMS_DISABLED",
        403,
        "File uploads in items are disabled for this workspace",
      );
    }

    if (isItemFaviconAttachment) {
      await this.assertItemFaviconTargetExists(input.vaultId, input.itemId);
    }

    if (input.encryptedBody.byteLength === 0) {
      throw new AttachmentServiceError("BAD_REQUEST", 400, "File body is required");
    }
    const maxSizeBytes = isItemFaviconAttachment ? ITEM_FAVICON_MAX_SIZE_BYTES : uploadLimits.maxSizeBytes;
    if (input.sizeBytes <= 0 || input.sizeBytes > maxSizeBytes) {
      throw new AttachmentServiceError("FILE_TOO_LARGE", 413, "File is too large");
    }
    if (input.encryptedBody.byteLength > maxSizeBytes + ENCRYPTED_BODY_SIZE_OVERHEAD_BYTES) {
      throw new AttachmentServiceError("FILE_TOO_LARGE", 413, "File is too large");
    }
    const allowedExtensions = isItemFaviconAttachment
      ? [...ITEM_FAVICON_ALLOWED_EXTENSIONS]
      : uploadLimits.allowedExtensions;
    if (
      allowedExtensions.length > 0 &&
      !isAllowedAttachmentExtension(input.fileName, allowedExtensions)
    ) {
      throw new AttachmentServiceError("INVALID_FILE_TYPE", 400, "File type is not allowed");
    }
    if (input.encryptedKey.byteLength === 0) {
      throw new AttachmentServiceError("INVALID_ATTACHMENT_METADATA", 400, "Encrypted attachment key is required");
    }

    const stored = await this.storage.upload({
      vaultId: input.vaultId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      body: input.encryptedBody,
      sizeBytes: input.sizeBytes,
    });

    try {
      if (isItemFaviconAttachment) {
        // Single icon-field slot per record/template: replace any previous item-favicon row.
        const { replaced } = await this.attachments.replaceItemFavicon({
          id: stored.attachmentId,
          vaultId: input.vaultId,
          itemId: input.itemId,
          storageKey: stored.storageKey,
          encryptedKey: input.encryptedKey,
          size: stored.sizeBytes,
        });
        await this.deleteStorageRecords(replaced);
      } else {
        await this.attachments.create({
          id: stored.attachmentId,
          vaultId: input.vaultId,
          itemId: input.itemId,
          storageKey: stored.storageKey,
          encryptedKey: input.encryptedKey,
          size: stored.sizeBytes,
          purpose: null,
        });
      }
    } catch (error) {
      await this.storage.deleteByStorageKey(stored.storageKey).catch(() => undefined);
      throw error;
    }

    return {
      attachmentId: stored.attachmentId,
      name: stored.name,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
    };
  }

  async download(vaultId: string, itemId: string, attachmentId: string, userId: string): Promise<AttachmentDownloadResult> {
    await this.assertVaultAccess(vaultId, userId);
    const record = await this.attachments.findByVaultItemAndId(vaultId, itemId, attachmentId);
    if (!record) {
      throw new AttachmentServiceError("ATTACHMENT_NOT_FOUND", 404, "Attachment not found");
    }

    const stored = await this.storage.get(record.storageKey);
    if (!stored) {
      throw new AttachmentServiceError("ATTACHMENT_NOT_FOUND", 404, "Attachment file not found");
    }

    return {
      record,
      encryptedBody: stored.body,
      name: stored.name,
      mimeType: stored.mimeType,
    };
  }

  async delete(vaultId: string, itemId: string, attachmentId: string, userId: string): Promise<void> {
    await this.assertVaultAccess(vaultId, userId);
    const removed = await this.attachments.deleteByVaultItemAndId(vaultId, itemId, attachmentId);
    if (removed) {
      await this.storage.deleteByStorageKey(removed.storageKey).catch(() => undefined);
    }
  }

  /** Remove all item attachments during hard purge, without a user session. */
  async purgeForItem(vaultId: string, itemId: string): Promise<void> {
    const removed = await this.attachments.deleteByVaultAndItem(vaultId, itemId);
    await this.deleteStorageRecords(removed);
  }

  /** Remove all attachments for a client-generated item/template id, regardless of vault scope. */
  async purgeForItemId(itemId: string): Promise<void> {
    const removed = await this.attachments.deleteByItem(itemId);
    await this.deleteStorageRecords(removed);
  }

  /**
   * True when the attachment exists in `vaultId` and that vault belongs to `workspaceId`.
   * Missing and out-of-scope ids both return false so callers can use one client error.
   */
  async attachmentBelongsToVault(
    attachmentId: string,
    vaultId: string,
    workspaceId: string,
  ): Promise<boolean> {
    const normalizedAttachmentId = attachmentId.trim();
    const normalizedVaultId = vaultId.trim();
    const normalizedWorkspaceId = workspaceId.trim();
    if (!normalizedAttachmentId || !normalizedVaultId || !normalizedWorkspaceId) {
      return false;
    }

    const existing = await this.attachments.findById(normalizedAttachmentId);
    if (!existing || existing.vaultId !== normalizedVaultId) {
      return false;
    }

    const vault = await this.vaults.findById(normalizedVaultId);
    return Boolean(vault && vault.workspaceId === normalizedWorkspaceId);
  }

  /**
   * Remove attachments for a template, scoped to the template's vault/workspace.
   * Never deletes by bare attachment id — only rows with matching vault_id + item_id.
   */
  async purgeForTemplate(
    templateId: string,
    scope: { vaultId: string; workspaceId: string },
  ): Promise<void> {
    const normalizedTemplateId = templateId.trim();
    const vaultId = scope.vaultId.trim();
    const workspaceId = scope.workspaceId.trim();
    if (!normalizedTemplateId || !vaultId || !workspaceId) {
      return;
    }

    const vault = await this.vaults.findById(vaultId);
    if (!vault || vault.workspaceId !== workspaceId) {
      return;
    }

    const removed = await this.attachments.deleteByVaultAndItem(vaultId, normalizedTemplateId);
    await this.deleteStorageRecords(removed);
  }

  private async deleteStorageRecords(records: AttachmentRecord[]): Promise<void> {
    await Promise.all(records.map((record) => this.storage.deleteByStorageKey(record.storageKey).catch(() => undefined)));
  }

  private async assertVaultAccess(vaultId: string, userId: string): Promise<void> {
    const allowed = await this.vaults.canReadVault(vaultId, userId);
    if (!allowed) {
      throw new AttachmentServiceError("FORBIDDEN", 403, "Vault access denied");
    }
  }

  /**
   * Item-favicon uploads are only for an existing non-deleted vault item
   * (event-log referenced id not in soft-delete retention) or a workspace item
   * template in the same workspace as the vault.
   */
  private async assertItemFaviconTargetExists(vaultId: string, itemId: string): Promise<void> {
    if (await this.events.hasReferencedItemId(vaultId, itemId)) {
      if (await this.softDeletes.exists(vaultId, itemId)) {
        throw new AttachmentServiceError(
          "ITEM_NOT_FOUND",
          404,
          "Item or template not found for favicon upload",
        );
      }
      return;
    }

    const vault = await this.vaults.findById(vaultId);
    if (vault) {
      const template = await this.templates.findById(vault.workspaceId, itemId);
      if (template) {
        return;
      }
    }

    throw new AttachmentServiceError(
      "ITEM_NOT_FOUND",
      404,
      "Item or template not found for favicon upload",
    );
  }

  private async resolveUploadLimits(
    vaultId: string,
    itemId: string,
    userId: string,
  ): Promise<{
    allowedExtensions: string[];
    maxSizeBytes: number;
    filesInItemsEnabled: boolean;
    isWorkspaceLogoAttachment: boolean;
  }> {
    const vault = await this.vaults.findById(vaultId);
    if (!vault) {
      return {
        allowedExtensions: [],
        maxSizeBytes: maxFileSizeBytesFromMb(DEFAULT_MAX_FILE_SIZE_MB),
        filesInItemsEnabled: true,
        isWorkspaceLogoAttachment: false,
      };
    }

    const workspace = await this.workspaces.findById(vault.workspaceId);
    if (!workspace) {
      return {
        allowedExtensions: [],
        maxSizeBytes: maxFileSizeBytesFromMb(DEFAULT_MAX_FILE_SIZE_MB),
        filesInItemsEnabled: true,
        isWorkspaceLogoAttachment: false,
      };
    }

    // Logo uses a synthetic item id (= workspace id) on the branding vault only:
    // the actor's personal vault, or the workspace's designated logo vault.
    // Shared vaults must not inherit this exception from itemId === workspaceId alone.
    const isActorPersonalVault = vault.isPersonal === true && vault.ownerId === userId;
    const isDesignatedLogoVault = workspace.logoVaultId === vaultId;
    const isLogoVaultCandidate =
      itemId === vault.workspaceId && (isActorPersonalVault || isDesignatedLogoVault);
    const isWorkspaceLogoAttachment =
      isLogoVaultCandidate && (await this.canUpdateWorkspaceBranding(vault.workspaceId, userId));

    return {
      // Logo upload UI accepts images only; do not bind it to the item-file extension list.
      allowedExtensions: isWorkspaceLogoAttachment
        ? [...WORKSPACE_LOGO_ALLOWED_EXTENSIONS]
        : workspace.allowedFileExtensions,
      maxSizeBytes: maxFileSizeBytesFromMb(workspace.maxFileSizeMb),
      filesInItemsEnabled:
        workspace.filesInItemsEnabled &&
        workspaceHasPlanFeature(this.config, workspace, "filesInItems"),
      isWorkspaceLogoAttachment,
    };
  }
}

/** Image types accepted by workspace branding logo upload UI. */
const WORKSPACE_LOGO_ALLOWED_EXTENSIONS = ["png", "jpg", "webp", "gif"] as const;

/** Absolute cap for item favicon uploads (independent of workspace maxFileSizeMb). */
export const ITEM_FAVICON_MAX_SIZE_BYTES = 256 * 1024;
const ITEM_FAVICON_ALLOWED_EXTENSIONS = ["png"] as const;

function attachmentExtensionFromFileName(fileName: string): string {
  const baseName = fileName.trim().split(/[/\\]/).pop() ?? fileName.trim();
  const dotIndex = baseName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === baseName.length - 1) {
    return "";
  }

  const extension = normalizeFileExtensionTag(baseName.slice(dotIndex + 1));
  return extension === "jpeg" ? "jpg" : extension;
}

function isAllowedAttachmentExtension(fileName: string, allowedExtensions: readonly string[]): boolean {
  const extension = attachmentExtensionFromFileName(fileName);
  if (!extension) {
    return false;
  }

  const allowed = new Set(allowedExtensions.map((item) => normalizeFileExtensionTag(item)));
  return allowed.has(extension);
}
