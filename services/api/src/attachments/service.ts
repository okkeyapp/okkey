import type { KeyFieldFileStorage } from "../storage/key-field-file-storage.ts";
import type { AttachmentsRepository, AttachmentRecord } from "../storage/attachments.ts";
import type { VaultsRepository } from "../storage/repositories.ts";

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
  vaults: Pick<VaultsRepository, "canReadVault">;
}

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export class AttachmentService {
  private readonly storage: KeyFieldFileStorage;
  private readonly attachments: AttachmentsRepository;
  private readonly vaults: Pick<VaultsRepository, "canReadVault">;

  constructor(deps: AttachmentServiceDeps) {
    this.storage = deps.storage;
    this.attachments = deps.attachments;
    this.vaults = deps.vaults;
  }

  async upload(input: AttachmentUploadInput): Promise<AttachmentUploadResult> {
    await this.assertVaultAccess(input.vaultId, input.userId);

    if (input.encryptedBody.byteLength === 0) {
      throw new AttachmentServiceError("BAD_REQUEST", 400, "File body is required");
    }
    if (input.encryptedBody.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new AttachmentServiceError("FILE_TOO_LARGE", 413, "File is too large");
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
}
