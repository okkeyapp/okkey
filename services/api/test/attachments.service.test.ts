import { createTestApiConfig } from "./test-api-config.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { AttachmentService, AttachmentServiceError } from "../src/attachments/service.ts";
import type { KeyFieldFileStorage } from "../src/storage/key-field-file-storage.ts";
import type { AttachmentsRepository } from "../src/storage/attachments.ts";
import type { VaultsRepository, WorkspacesRepository, WorkspaceRecord } from "../src/storage/repositories.ts";

const WORKSPACE_ID = "1000000000000000099";
const VAULT_ID = "1000000000000000001";
const REGULAR_ITEM_ID = "1000000000000000002";
const USER_ID = "1000000000000000009";

function workspaceStub(overrides: Partial<WorkspaceRecord> = {}): WorkspaceRecord {
  return {
    id: WORKSPACE_ID,
    name: "Test",
    ownerId: USER_ID,
    planTier: "PREMIUM",
    planCustomOverride: false,
    planFeatureOverrides: {},
    deletedItemsRetentionDays: 30,
    allowedFileExtensions: ["pdf", "zip"],
    maxFileSizeMb: 2,
    filesInItemsEnabled: true,
    capsulePolicies: {
      allowMode: "all",
      allowMemberIds: [],
      forceMaxViews: 0,
      passwordAttemptLimit: 0,
    },
    monitoringCardSettings: {},
    tileColor: null,
    logoVaultId: null,
    logoAttachmentId: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  } as WorkspaceRecord;
}

function uploadMocks(input: {
  filesInItemsEnabled?: boolean;
  planTier?: string;
  allowedFileExtensions?: string[];
  maxFileSizeMb?: number;
  deploymentMode?: "saas" | "self_hosted";
  enterpriseModulesEnabled?: boolean;
  existingItemFavicon?: { id: string; storageKey: string };
  /** When false, item-favicon target lookup fails (default: item exists). */
  itemExists?: boolean;
  templateExists?: boolean;
}) {
  let created: { itemId: string; purpose: string | null } | null = null;
  const deletedStorageKeys: string[] = [];
  let replacedFaviconCalls = 0;
  const storage = {
    async upload(params: { fileName: string }) {
      return {
        attachmentId: "1000000000000000003",
        storageKey: `attachments/${VAULT_ID}/1000000000000000003`,
        name: params.fileName,
        mimeType: "image/png",
        sizeBytes: 123,
      };
    },
    async deleteByStorageKey(storageKey: string) {
      deletedStorageKeys.push(storageKey);
    },
  } as unknown as KeyFieldFileStorage;
  const attachments = {
    async create(record: { itemId: string; purpose?: string | null }) {
      created = { itemId: record.itemId, purpose: record.purpose ?? null };
      return {
        id: "1000000000000000003",
        vaultId: VAULT_ID,
        itemId: record.itemId,
        storageKey: `attachments/${VAULT_ID}/1000000000000000003`,
        encryptedKey: Uint8Array.from([4, 5, 6]),
        size: 123,
        purpose: record.purpose ?? null,
        createdAt: "",
      };
    },
    async replaceItemFavicon(record: {
      id: string;
      vaultId: string;
      itemId: string;
      storageKey: string;
    }) {
      replacedFaviconCalls += 1;
      assert.equal(record.vaultId, VAULT_ID);
      assert.equal(record.itemId, REGULAR_ITEM_ID);
      created = { itemId: record.itemId, purpose: "item-favicon" };
      const replaced = input.existingItemFavicon
        ? [
            {
              id: input.existingItemFavicon.id,
              vaultId: VAULT_ID,
              itemId: REGULAR_ITEM_ID,
              storageKey: input.existingItemFavicon.storageKey,
              encryptedKey: Uint8Array.from([9]),
              size: 10,
              purpose: "item-favicon",
              createdAt: "",
            },
          ]
        : [];
      return {
        record: {
          id: record.id,
          vaultId: record.vaultId,
          itemId: record.itemId,
          storageKey: record.storageKey,
          encryptedKey: Uint8Array.from([4, 5, 6]),
          size: 123,
          purpose: "item-favicon",
          createdAt: "",
        },
        replaced,
      };
    },
  } as unknown as AttachmentsRepository;
  const vaults = {
    async canReadVault() {
      return true;
    },
    async findById() {
      return {
        id: VAULT_ID,
        workspaceId: WORKSPACE_ID,
        name: "Personal",
        description: "",
        icon: "",
        isPersonal: true,
        ownerId: USER_ID,
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      };
    },
  } as unknown as Pick<VaultsRepository, "canReadVault" | "findById">;
  const workspaces = {
    async findById() {
      return workspaceStub({
        filesInItemsEnabled: input.filesInItemsEnabled ?? false,
        planTier: input.planTier ?? "PREMIUM",
        allowedFileExtensions: input.allowedFileExtensions ?? ["pdf", "zip"],
        ...(input.maxFileSizeMb !== undefined ? { maxFileSizeMb: input.maxFileSizeMb } : {}),
      });
    },
  } as unknown as Pick<WorkspacesRepository, "findById">;

  const events = {
    async hasReferencedItemId() {
      return input.itemExists !== false;
    },
  };
  const templates = {
    async findById() {
      if (!input.templateExists) {
        return null;
      }
      return {
        id: REGULAR_ITEM_ID,
        workspaceId: WORKSPACE_ID,
        name: "Template",
        categoryId: "login",
        payloadJson: {},
        faviconId: null,
        createdBy: USER_ID,
        createdAt: "",
        updatedAt: "",
      };
    },
  };

  return {
    service: new AttachmentService({
      storage,
      attachments,
      vaults,
      workspaces,
      events,
      templates,
      config: createTestApiConfig({
        deploymentMode: input.deploymentMode ?? "saas",
        enterpriseModulesEnabled: input.enterpriseModulesEnabled ?? false,
      }),
    }),
    getCreated: () => created,
    getDeletedStorageKeys: () => deletedStorageKeys,
    getReplacedFaviconCalls: () => replacedFaviconCalls,
  };
}

function emptyEventsAndTemplates() {
  return {
    events: {
      async hasReferencedItemId() {
        return false;
      },
    },
    templates: {
      async findById() {
        return null;
      },
    },
  };
}

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
    async findById() {
      return null;
    },
  } as unknown as Pick<VaultsRepository, "canReadVault" | "findById">;
  const workspaces = {
    async findById() {
      return null;
    },
  } as unknown as Pick<WorkspacesRepository, "findById">;

  const service = new AttachmentService({
    storage,
    attachments,
    vaults,
    workspaces,
    ...emptyEventsAndTemplates(),
    config: createTestApiConfig({ deploymentMode: "saas" }),
  });

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
    async findById() {
      return null;
    },
  } as unknown as Pick<VaultsRepository, "canReadVault" | "findById">;
  const workspaces = {
    async findById() {
      return null;
    },
  } as unknown as Pick<WorkspacesRepository, "findById">;

  const service = new AttachmentService({
    storage,
    attachments,
    vaults,
    workspaces,
    ...emptyEventsAndTemplates(),
    config: createTestApiConfig({ deploymentMode: "saas" }),
  });

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

test("AttachmentService blocks regular item uploads when files in items are disabled", async () => {
  const { service } = uploadMocks({ filesInItemsEnabled: false, planTier: "PREMIUM" });

  await assert.rejects(
    () =>
      service.upload({
        vaultId: VAULT_ID,
        itemId: REGULAR_ITEM_ID,
        userId: USER_ID,
        fileName: "secret.pdf",
        mimeType: "application/pdf",
        encryptedBody: Uint8Array.from([1, 2, 3]),
        encryptedKey: Uint8Array.from([4, 5, 6]),
        sizeBytes: 123,
      }),
    (error: unknown) =>
      error instanceof AttachmentServiceError &&
      error.code === "FILES_IN_ITEMS_DISABLED" &&
      error.statusCode === 403,
  );
});

test("AttachmentService allows item uploads on self-hosted FREE when workspace toggle is on", async () => {
  const { service, getCreated } = uploadMocks({
    filesInItemsEnabled: true,
    planTier: "FREE",
    deploymentMode: "self_hosted",
    enterpriseModulesEnabled: false,
  });

  const result = await service.upload({
    vaultId: VAULT_ID,
    itemId: REGULAR_ITEM_ID,
    userId: USER_ID,
    fileName: "secret.pdf",
    mimeType: "application/pdf",
    encryptedBody: Uint8Array.from([1, 2, 3]),
    encryptedKey: Uint8Array.from([4, 5, 6]),
    sizeBytes: 123,
  });

  assert.equal(result.attachmentId, "1000000000000000003");
  assert.equal(getCreated()?.itemId, REGULAR_ITEM_ID);
});

test("AttachmentService blocks item uploads on SaaS FREE even when workspace toggle is on", async () => {
  const { service } = uploadMocks({
    filesInItemsEnabled: true,
    planTier: "FREE",
    deploymentMode: "saas",
  });

  await assert.rejects(
    () =>
      service.upload({
        vaultId: VAULT_ID,
        itemId: REGULAR_ITEM_ID,
        userId: USER_ID,
        fileName: "secret.pdf",
        mimeType: "application/pdf",
        encryptedBody: Uint8Array.from([1, 2, 3]),
        encryptedKey: Uint8Array.from([4, 5, 6]),
        sizeBytes: 123,
      }),
    (error: unknown) =>
      error instanceof AttachmentServiceError &&
      error.code === "FILES_IN_ITEMS_DISABLED" &&
      error.statusCode === 403,
  );
});

test("AttachmentService allows workspace logo upload when files in items are disabled", async () => {
  const { service, getCreated } = uploadMocks({
    filesInItemsEnabled: false,
    planTier: "FREE",
    allowedFileExtensions: ["pdf"],
  });

  const result = await service.upload({
    vaultId: VAULT_ID,
    itemId: WORKSPACE_ID,
    userId: USER_ID,
    fileName: "logo.webp",
    mimeType: "image/webp",
    encryptedBody: Uint8Array.from([1, 2, 3]),
    encryptedKey: Uint8Array.from([4, 5, 6]),
    sizeBytes: 123,
  });

  assert.equal(result.attachmentId, "1000000000000000003");
  assert.equal(getCreated()?.itemId, WORKSPACE_ID);
});

test("AttachmentService allows item-favicon purpose when files in items are disabled", async () => {
  const { service, getCreated, getReplacedFaviconCalls } = uploadMocks({
    filesInItemsEnabled: false,
    planTier: "FREE",
    allowedFileExtensions: ["pdf"],
    deploymentMode: "saas",
  });

  const result = await service.upload({
    vaultId: VAULT_ID,
    itemId: REGULAR_ITEM_ID,
    userId: USER_ID,
    fileName: "favicon.png",
    mimeType: "image/png",
    encryptedBody: Uint8Array.from([1, 2, 3]),
    encryptedKey: Uint8Array.from([4, 5, 6]),
    sizeBytes: 123,
    purpose: "item-favicon",
  });

  assert.equal(result.attachmentId, "1000000000000000003");
  assert.equal(getCreated()?.itemId, REGULAR_ITEM_ID);
  assert.equal(getCreated()?.purpose, "item-favicon");
  assert.equal(getReplacedFaviconCalls(), 1);
});

test("AttachmentService rejects item-favicon purpose for unknown itemId", async () => {
  const { service, getReplacedFaviconCalls } = uploadMocks({
    filesInItemsEnabled: false,
    planTier: "FREE",
    allowedFileExtensions: ["pdf"],
    deploymentMode: "saas",
    itemExists: false,
    templateExists: false,
  });

  await assert.rejects(
    () =>
      service.upload({
        vaultId: VAULT_ID,
        itemId: REGULAR_ITEM_ID,
        userId: USER_ID,
        fileName: "favicon.png",
        mimeType: "image/png",
        encryptedBody: Uint8Array.from([1, 2, 3]),
        encryptedKey: Uint8Array.from([4, 5, 6]),
        sizeBytes: 123,
        purpose: "item-favicon",
      }),
    (error: unknown) =>
      error instanceof AttachmentServiceError &&
      error.code === "ITEM_NOT_FOUND" &&
      error.statusCode === 404,
  );
  assert.equal(getReplacedFaviconCalls(), 0);
});

test("AttachmentService allows item-favicon purpose for existing workspace template", async () => {
  const { service, getCreated } = uploadMocks({
    filesInItemsEnabled: false,
    planTier: "FREE",
    allowedFileExtensions: ["pdf"],
    deploymentMode: "saas",
    itemExists: false,
    templateExists: true,
  });

  const result = await service.upload({
    vaultId: VAULT_ID,
    itemId: REGULAR_ITEM_ID,
    userId: USER_ID,
    fileName: "favicon.png",
    mimeType: "image/png",
    encryptedBody: Uint8Array.from([1, 2, 3]),
    encryptedKey: Uint8Array.from([4, 5, 6]),
    sizeBytes: 123,
    purpose: "item-favicon",
  });

  assert.equal(result.attachmentId, "1000000000000000003");
  assert.equal(getCreated()?.purpose, "item-favicon");
});

test("AttachmentService replaces previous item-favicon slot on upload", async () => {
  const previousStorageKey = `attachments/${VAULT_ID}/1000000000000000008`;
  const { service, getCreated, getDeletedStorageKeys, getReplacedFaviconCalls } = uploadMocks({
    filesInItemsEnabled: false,
    planTier: "FREE",
    allowedFileExtensions: ["pdf"],
    deploymentMode: "saas",
    existingItemFavicon: {
      id: "1000000000000000008",
      storageKey: previousStorageKey,
    },
  });

  const result = await service.upload({
    vaultId: VAULT_ID,
    itemId: REGULAR_ITEM_ID,
    userId: USER_ID,
    fileName: "site-icon.png",
    mimeType: "image/png",
    encryptedBody: Uint8Array.from([1, 2, 3]),
    encryptedKey: Uint8Array.from([4, 5, 6]),
    sizeBytes: 123,
    purpose: "item-favicon",
  });

  assert.equal(result.attachmentId, "1000000000000000003");
  assert.equal(getCreated()?.purpose, "item-favicon");
  assert.equal(getReplacedFaviconCalls(), 1);
  assert.deepEqual(getDeletedStorageKeys(), [previousStorageKey]);
});

test("AttachmentService does not replace favicon slot for regular uploads", async () => {
  const { service, getCreated, getReplacedFaviconCalls, getDeletedStorageKeys } = uploadMocks({
    filesInItemsEnabled: true,
    planTier: "PREMIUM",
    allowedFileExtensions: ["png", "pdf"],
    existingItemFavicon: {
      id: "1000000000000000008",
      storageKey: `attachments/${VAULT_ID}/1000000000000000008`,
    },
  });

  const result = await service.upload({
    vaultId: VAULT_ID,
    itemId: REGULAR_ITEM_ID,
    userId: USER_ID,
    fileName: "photo.png",
    mimeType: "image/png",
    encryptedBody: Uint8Array.from([1, 2, 3]),
    encryptedKey: Uint8Array.from([4, 5, 6]),
    sizeBytes: 123,
  });

  assert.equal(result.attachmentId, "1000000000000000003");
  assert.equal(getCreated()?.purpose, null);
  assert.equal(getReplacedFaviconCalls(), 0);
  assert.deepEqual(getDeletedStorageKeys(), []);
});

test("AttachmentService does not treat favicon.png name alone as item favicon", async () => {
  const { service } = uploadMocks({
    filesInItemsEnabled: false,
    planTier: "PREMIUM",
    allowedFileExtensions: ["png", "pdf"],
  });

  await assert.rejects(
    () =>
      service.upload({
        vaultId: VAULT_ID,
        itemId: REGULAR_ITEM_ID,
        userId: USER_ID,
        fileName: "favicon.png",
        mimeType: "image/png",
        encryptedBody: Uint8Array.from([1, 2, 3]),
        encryptedKey: Uint8Array.from([4, 5, 6]),
        sizeBytes: 123,
      }),
    (error: unknown) =>
      error instanceof AttachmentServiceError &&
      error.code === "FILES_IN_ITEMS_DISABLED" &&
      error.statusCode === 403,
  );
});

test("AttachmentService still blocks non-favicon uploads when files in items are disabled", async () => {
  const { service } = uploadMocks({
    filesInItemsEnabled: false,
    planTier: "PREMIUM",
    allowedFileExtensions: ["png", "pdf"],
  });

  await assert.rejects(
    () =>
      service.upload({
        vaultId: VAULT_ID,
        itemId: REGULAR_ITEM_ID,
        userId: USER_ID,
        fileName: "photo.png",
        mimeType: "image/png",
        encryptedBody: Uint8Array.from([1, 2, 3]),
        encryptedKey: Uint8Array.from([4, 5, 6]),
        sizeBytes: 123,
      }),
    (error: unknown) =>
      error instanceof AttachmentServiceError &&
      error.code === "FILES_IN_ITEMS_DISABLED" &&
      error.statusCode === 403,
  );
});

test("AttachmentService skips workspace size limit for item-favicon purpose", async () => {
  // 1 byte workspace cap would reject ordinary uploads; favicon purpose uses its own absolute cap.
  const { service, getCreated } = uploadMocks({
    filesInItemsEnabled: true,
    planTier: "PREMIUM",
    allowedFileExtensions: ["pdf"],
    maxFileSizeMb: 1 / (1024 * 1024),
  });

  const result = await service.upload({
    vaultId: VAULT_ID,
    itemId: REGULAR_ITEM_ID,
    userId: USER_ID,
    fileName: "site-icon.png",
    mimeType: "image/png",
    encryptedBody: Uint8Array.from([1, 2, 3]),
    encryptedKey: Uint8Array.from([4, 5, 6]),
    sizeBytes: 123,
    purpose: "item-favicon",
  });

  assert.equal(result.attachmentId, "1000000000000000003");
  assert.equal(getCreated()?.itemId, REGULAR_ITEM_ID);
});

test("AttachmentService still enforces size limit for favicon.png without purpose", async () => {
  const { service } = uploadMocks({
    filesInItemsEnabled: true,
    planTier: "PREMIUM",
    allowedFileExtensions: ["png", "pdf"],
    maxFileSizeMb: 1 / (1024 * 1024),
  });

  await assert.rejects(
    () =>
      service.upload({
        vaultId: VAULT_ID,
        itemId: REGULAR_ITEM_ID,
        userId: USER_ID,
        fileName: "favicon.png",
        mimeType: "image/png",
        encryptedBody: Uint8Array.from([1, 2, 3]),
        encryptedKey: Uint8Array.from([4, 5, 6]),
        sizeBytes: 123,
      }),
    (error: unknown) =>
      error instanceof AttachmentServiceError &&
      error.code === "FILE_TOO_LARGE" &&
      error.statusCode === 413,
  );
});

test("AttachmentService still blocks non-image workspace-system uploads", async () => {
  const { service } = uploadMocks({ filesInItemsEnabled: false, planTier: "FREE" });

  await assert.rejects(
    () =>
      service.upload({
        vaultId: VAULT_ID,
        itemId: WORKSPACE_ID,
        userId: USER_ID,
        fileName: "payload.zip",
        mimeType: "application/zip",
        encryptedBody: Uint8Array.from([1, 2, 3]),
        encryptedKey: Uint8Array.from([4, 5, 6]),
        sizeBytes: 123,
      }),
    (error: unknown) =>
      error instanceof AttachmentServiceError && error.code === "INVALID_FILE_TYPE",
  );
});

test("AttachmentService purges all item attachment objects", async () => {
  const deletedStorageKeys: string[] = [];
  const storage = {
    async deleteByStorageKey(storageKey: string) {
      deletedStorageKeys.push(storageKey);
    },
  } as unknown as KeyFieldFileStorage;
  const attachments = {
    async deleteByVaultAndItem(vaultId: string, itemId: string) {
      assert.equal(vaultId, "1000000000000000001");
      assert.equal(itemId, "1000000000000000002");
      return [
        {
          id: "1000000000000000003",
          vaultId,
          itemId,
          storageKey: "attachments/1000000000000000001/1000000000000000003",
          encryptedKey: Uint8Array.from([1]),
          size: 10,
          createdAt: "",
        },
        {
          id: "1000000000000000004",
          vaultId,
          itemId,
          storageKey: "attachments/1000000000000000001/1000000000000000004",
          encryptedKey: Uint8Array.from([2]),
          size: 20,
          createdAt: "",
        },
      ];
    },
  } as unknown as AttachmentsRepository;
  const vaults = {} as unknown as Pick<VaultsRepository, "canReadVault" | "findById">;
  const workspaces = {} as unknown as Pick<WorkspacesRepository, "findById">;

  const service = new AttachmentService({
    storage,
    attachments,
    vaults,
    workspaces,
    ...emptyEventsAndTemplates(),
    config: createTestApiConfig({ deploymentMode: "saas" }),
  });

  await service.purgeForItem("1000000000000000001", "1000000000000000002");

  assert.deepEqual(deletedStorageKeys, [
    "attachments/1000000000000000001/1000000000000000003",
    "attachments/1000000000000000001/1000000000000000004",
  ]);
});

test("AttachmentService purges all attachment objects by item id", async () => {
  const deletedStorageKeys: string[] = [];
  const storage = {
    async deleteByStorageKey(storageKey: string) {
      deletedStorageKeys.push(storageKey);
    },
  } as unknown as KeyFieldFileStorage;
  const attachments = {
    async deleteByItem(itemId: string) {
      assert.equal(itemId, "1000000000000000002");
      return [
        {
          id: "1000000000000000003",
          vaultId: "1000000000000000001",
          itemId,
          storageKey: "attachments/1000000000000000001/1000000000000000003",
          encryptedKey: Uint8Array.from([1]),
          size: 10,
          createdAt: "",
        },
        {
          id: "1000000000000000004",
          vaultId: "1000000000000000005",
          itemId,
          storageKey: "attachments/1000000000000000005/1000000000000000004",
          encryptedKey: Uint8Array.from([2]),
          size: 20,
          createdAt: "",
        },
      ];
    },
  } as unknown as AttachmentsRepository;
  const vaults = {} as unknown as Pick<VaultsRepository, "canReadVault" | "findById">;
  const workspaces = {} as unknown as Pick<WorkspacesRepository, "findById">;

  const service = new AttachmentService({
    storage,
    attachments,
    vaults,
    workspaces,
    ...emptyEventsAndTemplates(),
    config: createTestApiConfig({ deploymentMode: "saas" }),
  });

  await service.purgeForItemId("1000000000000000002");

  assert.deepEqual(deletedStorageKeys, [
    "attachments/1000000000000000001/1000000000000000003",
    "attachments/1000000000000000005/1000000000000000004",
  ]);
});

test("AttachmentService purges template attachments by scope and referenced ids", async () => {
  const deletedStorageKeys: string[] = [];
  const storage = {
    async deleteByStorageKey(storageKey: string) {
      deletedStorageKeys.push(storageKey);
    },
  } as unknown as KeyFieldFileStorage;
  const attachments = {
    async deleteByItem(itemId: string) {
      assert.equal(itemId, "1000000000000000002");
      return [
        {
          id: "1000000000000000003",
          vaultId: "1000000000000000001",
          itemId,
          storageKey: "attachments/1000000000000000001/1000000000000000003",
          encryptedKey: Uint8Array.from([1]),
          size: 10,
          createdAt: "",
        },
      ];
    },
    async findById(attachmentId: string) {
      if (attachmentId === "1000000000000000004") {
        return {
          id: "1000000000000000004",
          vaultId: "1000000000000000001",
          itemId: "1000000000000000009",
          storageKey: "attachments/1000000000000000001/1000000000000000004",
          encryptedKey: Uint8Array.from([2]),
          size: 20,
          createdAt: "",
        };
      }
      return null;
    },
    async deleteById(attachmentId: string) {
      if (attachmentId === "1000000000000000004") {
        return {
          id: "1000000000000000004",
          vaultId: "1000000000000000001",
          itemId: "1000000000000000009",
          storageKey: "attachments/1000000000000000001/1000000000000000004",
          encryptedKey: Uint8Array.from([2]),
          size: 20,
          createdAt: "",
        };
      }
      return null;
    },
  } as unknown as AttachmentsRepository;
  const vaults = {} as unknown as Pick<VaultsRepository, "canReadVault" | "findById">;
  const workspaces = {} as unknown as Pick<WorkspacesRepository, "findById">;

  const service = new AttachmentService({
    storage,
    attachments,
    vaults,
    workspaces,
    ...emptyEventsAndTemplates(),
    config: createTestApiConfig({ deploymentMode: "saas" }),
  });

  await service.purgeForTemplate("1000000000000000002", ["1000000000000000003", "1000000000000000004"]);

  assert.deepEqual(deletedStorageKeys, [
    "attachments/1000000000000000001/1000000000000000003",
    "attachments/1000000000000000001/1000000000000000004",
  ]);
});
