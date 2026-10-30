import assert from "node:assert/strict";
import test from "node:test";

import { createTestApiConfig } from "./test-api-config.ts";
import {
  WorkspaceSettingsService,
  WorkspaceSettingsServiceError,
} from "../src/workspace-settings/service.ts";

const WORKSPACE_ID = "1000000000000000001";
const USER_ID = "1000000000000000009";
const LOGO_VAULT_ID = "1000000000000000002";
const MISSING_VAULT_ID = "1000000000000000099";

function workspaceRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: WORKSPACE_ID,
    name: "Acme",
    ownerId: USER_ID,
    planTier: "team",
    deletedItemsRetentionDays: 30,
    allowedFileExtensions: [] as string[],
    maxFileSizeMb: 25,
    filesInItemsEnabled: true,
    capsulePolicies: {
      forceMaxViews: 0,
      forcePassword: false,
      passwordAttemptLimit: 3,
      allowGuestAccess: true,
      allowExternalRecipients: true,
    },
    monitoringCardSettings: {},
    tileColor: null,
    logoVaultId: null,
    logoAttachmentId: null,
    ...overrides,
  };
}

function createService(opts: {
  findVaultById: (id: string) => Promise<unknown>;
}) {
  return new WorkspaceSettingsService({
    workspaces: {
      findById: async () => workspaceRecord() as never,
      hasAccess: async () => true,
      updateGeneralSettings: async () => {
        throw new Error("should not reach DB update");
      },
      deleteOwnedWorkspace: async () => false,
    },
    vaults: {
      findById: opts.findVaultById as never,
    },
    db: {
      // Owner lookup for assertWorkspacePermission → full matrix.
      query: async () => [{ owner_id: USER_ID }],
    } as never,
    config: createTestApiConfig(),
  });
}

test("updateSettings returns 404 when logo_vault_id does not exist", async () => {
  const service = createService({
    findVaultById: async () => null,
  });

  await assert.rejects(
    () =>
      service.updateSettings(WORKSPACE_ID, USER_ID, {
        logoVaultId: MISSING_VAULT_ID,
      }),
    (error: unknown) =>
      error instanceof WorkspaceSettingsServiceError &&
      error.statusCode === 404 &&
      error.code === "LOGO_VAULT_NOT_FOUND",
  );
});

test("updateSettings returns 404 when logo vault belongs to another workspace", async () => {
  const service = createService({
    findVaultById: async () => ({
      id: MISSING_VAULT_ID,
      workspaceId: "1000000000000000888",
    }),
  });

  await assert.rejects(
    () =>
      service.updateSettings(WORKSPACE_ID, USER_ID, {
        logoVaultId: MISSING_VAULT_ID,
      }),
    (error: unknown) =>
      error instanceof WorkspaceSettingsServiceError &&
      error.statusCode === 404 &&
      error.code === "LOGO_VAULT_NOT_FOUND",
  );
});

test("updateSettings reaches vault lookup for a valid workspace logo vault", async () => {
  let lookedUp = false;
  const service = new WorkspaceSettingsService({
    workspaces: {
      findById: async () => workspaceRecord() as never,
      hasAccess: async () => true,
      updateGeneralSettings: async (_id, update) => {
        assert.equal(update.logoVaultId, LOGO_VAULT_ID);
        return workspaceRecord({ logoVaultId: LOGO_VAULT_ID }) as never;
      },
      deleteOwnedWorkspace: async () => false,
    },
    vaults: {
      findById: async (id: string) => {
        lookedUp = true;
        assert.equal(id, LOGO_VAULT_ID);
        return { id: LOGO_VAULT_ID, workspaceId: WORKSPACE_ID } as never;
      },
    },
    db: {
      query: async () => [{ owner_id: USER_ID }],
    } as never,
    config: createTestApiConfig(),
  });

  const updated = await service.updateSettings(WORKSPACE_ID, USER_ID, {
    logoVaultId: LOGO_VAULT_ID,
  });
  assert.equal(lookedUp, true);
  assert.equal(updated.logoVaultId, LOGO_VAULT_ID);
});
