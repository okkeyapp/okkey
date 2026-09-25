import type { KeyFieldFileStorage } from "../storage/key-field-file-storage.ts";
import type { AttachmentsRepository, AttachmentRecord } from "../storage/attachments.ts";
import type { VaultsRepository, WorkspacesRepository } from "../storage/repositories.ts";
import {
  DEFAULT_MAX_FILE_SIZE_MB,
  hasPlanFeature,
  maxFileSizeBytesFromMb,
  normalizeFileExtensionTag,
  planEntitlementOptionsFromWorkspace,
} from "@okkey/types";

export class AttachmentServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface AttachmentUploadInput {
  vaultId: string;
  itemId: string;
  userId: string;
  fileName: string;
  mimeType: string;
  encryptedBody: Uint8Array;
  encryptedKey: Uint8Array;
  sizeBytes: number;
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
}

const ENCRYPTED_BODY_SIZE_OVERHEAD_BYTES = 1024 * 1024;

export class AttachmentService {
  private readonly storage: KeyFieldFileStorage;
  private readonly attachments: AttachmentsRepository;
  private readonly vaults: Pick<VaultsRepository, "canReadVault" | "findById">;
  private readonly workspaces: Pick<WorkspacesRepository, "findById">;

  constructor(deps: AttachmentServiceDeps) {
    this.storage = deps.storage;
    this.attachments = deps.attachments;
    this.vaults = deps.vaults;
    this.workspaces = deps.workspaces;
  }

  async upload(input: AttachmentUploadInput): Promise<AttachmentUploadResult> {
    await this.assertVaultAccess(input.vaultId, input.userId);

    const uploadLimits = await this.resolveUploadLimits(input.vaultId, input.itemId);

    // Workspace branding logo uses workspaceId as a synthetic item id; that path must
    // stay available when "files in items" is disabled for regular vault item uploads.
    if (!uploadLimits.filesInItemsEnabled && !uploadLimits.isWorkspaceSystemAttachment) {
      throw new AttachmentServiceError(
        "FILES_IN_ITEMS_DISABLED",
        403,
        "File uploads in items are disabled for this workspace",
      );
    }

    if (input.encryptedBody.byteLength === 0) {
      throw new AttachmentServiceError("BAD_REQUEST", 400, "File body is required");
    }
    if (input.sizeBytes <= 0 || input.sizeBytes > uploadLimits.maxSizeBytes) {
      throw new AttachmentServiceError("FILE_TOO_LARGE", 413, "File is too large");
    }
    if (input.encryptedBody.byteLength > uploadLimits.maxSizeBytes + ENCRYPTED_BODY_SIZE_OVERHEAD_BYTES) {
      throw new AttachmentServiceError("FILE_TOO_LARGE", 413, "File is too large");
    }
    if (
      uploadLimits.allowedExtensions.length > 0 &&
      !isAllowedAttachmentExtension(input.fileName, uploadLimits.allowedExtensions)
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
      await this.attachments.create({
        id: stored.attachmentId,
        vaultId: input.vaultId,
        itemId: input.itemId,
        storageKey: stored.storageKey,
        encryptedKey: input.encryptedKey,
        size: stored.sizeBytes,
      });
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

  /** Remove template/item attachments by scope and any ids referenced in persisted metadata. */
  async purgeForTemplate(templateId: string, referencedAttachmentIds: Iterable<string>): Promise<void> {
    await this.purgeForItemId(templateId);

    const seen = new Set<string>();
    for (const rawId of referencedAttachmentIds) {
      const attachmentId = rawId.trim();
      if (!attachmentId || seen.has(attachmentId)) {
        continue;
      }
      seen.add(attachmentId);

      const existing = await this.attachments.findById(attachmentId);
      if (!existing) {
        continue;
      }

      const removed = await this.attachments.deleteById(attachmentId);
      if (removed) {
        await this.storage.deleteByStorageKey(removed.storageKey).catch(() => undefined);
      }
    }
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

  private async resolveUploadLimits(
    vaultId: string,
    itemId: string,
  ): Promise<{
    allowedExtensions: string[];
    maxSizeBytes: number;
    filesInItemsEnabled: boolean;
    isWorkspaceSystemAttachment: boolean;
  }> {
    const vault = await this.vaults.findById(vaultId);
    if (!vault) {
      return {
        allowedExtensions: [],
        maxSizeBytes: maxFileSizeBytesFromMb(DEFAULT_MAX_FILE_SIZE_MB),
        filesInItemsEnabled: true,
        isWorkspaceSystemAttachment: false,
      };
    }

    // Workspace branding logo uses the workspace id as a synthetic item id.
    const isWorkspaceSystemAttachment = vault.workspaceId === itemId;

    const workspace = await this.workspaces.findById(vault.workspaceId);
    if (!workspace) {
      return {
        allowedExtensions: [],
        maxSizeBytes: maxFileSizeBytesFromMb(DEFAULT_MAX_FILE_SIZE_MB),
        filesInItemsEnabled: true,
        isWorkspaceSystemAttachment,
      };
    }

    return {
      // Logo upload UI accepts images only; do not bind it to the item-file extension list.
      allowedExtensions: isWorkspaceSystemAttachment
        ? [...WORKSPACE_LOGO_ALLOWED_EXTENSIONS]
        : workspace.allowedFileExtensions,
      maxSizeBytes: maxFileSizeBytesFromMb(workspace.maxFileSizeMb),
      filesInItemsEnabled:
        workspace.filesInItemsEnabled &&
        hasPlanFeature(
          workspace.planTier,
          "filesInItems",
          planEntitlementOptionsFromWorkspace(workspace),
        ),
      isWorkspaceSystemAttachment,
    };
  }
}

/** Image types accepted by workspace branding logo upload UI. */
const WORKSPACE_LOGO_ALLOWED_EXTENSIONS = ["png", "jpg", "webp", "gif"] as const;

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
