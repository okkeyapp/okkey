import test from "node:test";
import assert from "node:assert/strict";
import { AttachmentService } from "../src/attachments/service.ts";
import type { KeyFieldFileStorage } from "../src/storage/key-field-file-storage.ts";
import type { AttachmentsRepository } from "../src/storage/attachments.ts";
import type { VaultsRepository } from "../src/storage/repositories.ts";

test("AttachmentService removes uploaded object when metadata insert fails", async () => {
  let deletedStorageKey = "";
  const storage = {
    async upload() {
      return {
        attachmentId: "1000000000000000003",
        storageKey: "attachments/1000000000000000001/1000000000000000003",
        name: "secret.pdf",
        mimeType: "application/pdf",
        sizeBytes: 123,
      };
    },
    async deleteByStorageKey(storageKey: string) {
      deletedStorageKey = storageKey;
    },
  } as unknown as KeyFieldFileStorage;
  const attachments = {
    async create() {
      throw new Error("db failed");
    },
  } as unknown as AttachmentsRepository;
  const vaults = {
    async canReadVault() {
      return true;
    },
  } as unknown as Pick<VaultsRepository, "canReadVault">;

  const service = new AttachmentService({ storage, attachments, vaults });

  await assert.rejects(() =>
    service.upload({
      vaultId: "1000000000000000001",
      itemId: "1000000000000000002",
      userId: "1000000000000000009",
      fileName: "secret.pdf",
      mimeType: "application/pdf",
      encryptedBody: Uint8Array.from([1, 2, 3]),
      encryptedKey: Uint8Array.from([4, 5, 6]),
      sizeBytes: 123,
    }),
  );
  assert.equal(deletedStorageKey, "attachments/1000000000000000001/1000000000000000003");
});

test("AttachmentService denies vault access before storage operations", async () => {
  let uploaded = false;
  const storage = {
    async upload() {
      uploaded = true;
      throw new Error("should not upload");
    },
  } as unknown as KeyFieldFileStorage;
  const attachments = {} as unknown as AttachmentsRepository;
  const vaults = {
    async canReadVault() {
      return false;
    },
  } as unknown as Pick<VaultsRepository, "canReadVault">;

  const service = new AttachmentService({ storage, attachments, vaults });

  await assert.rejects(
    () =>
      service.upload({
        vaultId: "1000000000000000001",
        itemId: "1000000000000000002",
        userId: "1000000000000000009",
        fileName: "secret.pdf",
        mimeType: "application/pdf",
        encryptedBody: Uint8Array.from([1, 2, 3]),
        encryptedKey: Uint8Array.from([4, 5, 6]),
        sizeBytes: 123,
      }),
    /Vault access denied/,
  );
  assert.equal(uploaded, false);
});
