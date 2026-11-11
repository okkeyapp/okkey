import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createSimpleProfilePermissions,
  createFullAccessProfilePermissions,
  PROFILE_RESOURCE_PERMISSION_OWN,
} from "@okkey/types";

import {
  ACCESS_DENIED,
  PROFILE_PERMISSION_DENIED,
  resolveSyncWriteAction,
  VaultProfileWriteGuardError,
  VaultProfileWriteGuardService,
} from "../src/vault-profile-write-guard/service.ts";
import type { VaultProfileWriteGuardRepository } from "../src/vault-profile-write-guard/repository.ts";

const SIMPLE = createSimpleProfilePermissions();
const EXTENDED = createFullAccessProfilePermissions();
const OWN_PUT = {
  ...EXTENDED,
  entries: {
    ...EXTENDED.entries,
    put: PROFILE_RESOURCE_PERMISSION_OWN,
    delete: PROFILE_RESOURCE_PERMISSION_OWN,
  },
};

function repoStub(options: {
  isPersonal?: boolean;
  permissionsJson?: unknown | null;
  hasProfileAssignment?: boolean;
  itemCreatorId?: string | null;
  workspaceId?: string;
}): VaultProfileWriteGuardRepository {
  const permissionsJson =
    options.permissionsJson === undefined ? SIMPLE : options.permissionsJson;
  return {
    findVaultProfile: async () => ({
      vaultId: "vault-1",
      workspaceId: options.workspaceId ?? "ws-1",
      isPersonal: options.isPersonal ?? false,
      permissionsJson,
      hasProfileAssignment:
        options.hasProfileAssignment ?? permissionsJson != null,
    }),
    findItemCreatorUserId: async () => options.itemCreatorId ?? null,
  } as VaultProfileWriteGuardRepository;
}

function serviceFor(
  repo: VaultProfileWriteGuardRepository,
  options: { canManage?: boolean; canRead?: boolean } = {},
): VaultProfileWriteGuardService {
  return new VaultProfileWriteGuardService(repo, {
    canManageVaultSettings: async () => options.canManage ?? false,
    canReadVault: async () => options.canRead ?? true,
  });
}

test("resolveSyncWriteAction maps item and manage events; denies unknown", () => {
  assert.equal(resolveSyncWriteAction({ eventType: "ITEM_CREATE" }), "entries.post");
  assert.equal(resolveSyncWriteAction({ eventType: "ITEM_UPDATE" }), "entries.put");
  assert.equal(
    resolveSyncWriteAction({ eventType: "ITEM_UPDATE", itemSoftDeleted: true }),
    "entries.delete",
  );
  assert.equal(resolveSyncWriteAction({ eventType: "ITEM_DELETE" }), "entries.delete");
  assert.equal(resolveSyncWriteAction({ eventType: "DEVICE_ADD" }), "vault.manage");
  assert.equal(resolveSyncWriteAction({ eventType: "DEVICE_REMOVE" }), "vault.manage");
  assert.equal(resolveSyncWriteAction({ eventType: "VAULT_CREATE" }), "vault.manage");
  assert.equal(resolveSyncWriteAction({ eventType: "VAULT_SHARE" }), "vault.manage");
  assert.equal(
    resolveSyncWriteAction({ eventType: "VAULT_KEY_ROTATION" }),
    "vault.manage",
  );
  assert.equal(resolveSyncWriteAction({ eventType: "UNKNOWN" }), "deny");
});

test("Simple profile is denied ITEM_CREATE / UPDATE / DELETE on shared vault", async () => {
  const service = serviceFor(
    repoStub({ permissionsJson: SIMPLE, hasProfileAssignment: true }),
  );

  for (const eventType of ["ITEM_CREATE", "ITEM_UPDATE", "ITEM_DELETE"] as const) {
    await assert.rejects(
      () =>
        service.assertSyncAppendAllowed({
          vaultId: "vault-1",
          userId: "ro",
          eventType,
          referencedItemId: "1000000000000000001",
          itemSoftDeleted: eventType === "ITEM_UPDATE" ? false : undefined,
        }),
      (error: unknown) => {
        assert.ok(error instanceof VaultProfileWriteGuardError);
        assert.equal(error.code, PROFILE_PERMISSION_DENIED);
        assert.equal(error.statusCode, 403);
        return true;
      },
    );
  }
});

test("Extended profile allows ITEM_CREATE / UPDATE / DELETE on shared vault", async () => {
  const createService = serviceFor(
    repoStub({ permissionsJson: EXTENDED, hasProfileAssignment: true }),
  );
  await createService.assertSyncAppendAllowed({
    vaultId: "vault-1",
    userId: "rw",
    eventType: "ITEM_CREATE",
    referencedItemId: "1000000000000000001",
  });

  const mutateService = serviceFor(
    repoStub({
      permissionsJson: EXTENDED,
      hasProfileAssignment: true,
      itemCreatorId: "owner",
    }),
  );
  await mutateService.assertSyncAppendAllowed({
    vaultId: "vault-1",
    userId: "rw",
    eventType: "ITEM_UPDATE",
    referencedItemId: "1000000000000000001",
  });
  await mutateService.assertSyncAppendAllowed({
    vaultId: "vault-1",
    userId: "rw",
    eventType: "ITEM_DELETE",
    referencedItemId: "1000000000000000001",
  });
});

test("personal vault bypasses profile checks", async () => {
  const service = serviceFor(
    repoStub({ isPersonal: true, permissionsJson: SIMPLE, hasProfileAssignment: true }),
  );

  await service.assertSyncAppendAllowed({
    vaultId: "vault-1",
    userId: "ro",
    eventType: "ITEM_CREATE",
    referencedItemId: "1000000000000000001",
  });
});

test("shared vault without profile assignment is denied (fail-closed)", async () => {
  const service = serviceFor(
    repoStub({
      permissionsJson: null,
      hasProfileAssignment: false,
    }),
  );

  await assert.rejects(
    () =>
      service.assertSyncAppendAllowed({
        vaultId: "vault-1",
        userId: "ro",
        eventType: "ITEM_CREATE",
        referencedItemId: "1000000000000000001",
      }),
    (error: unknown) => {
      assert.ok(error instanceof VaultProfileWriteGuardError);
      assert.equal(error.code, PROFILE_PERMISSION_DENIED);
      return true;
    },
  );
});

test("non-member of shared vault gets ACCESS_DENIED", async () => {
  const service = serviceFor(
    repoStub({ permissionsJson: SIMPLE, hasProfileAssignment: true }),
    { canRead: false },
  );

  await assert.rejects(
    () =>
      service.assertSyncAppendAllowed({
        vaultId: "vault-1",
        userId: "outsider",
        eventType: "ITEM_UPDATE",
        referencedItemId: "1000000000000000001",
      }),
    (error: unknown) => {
      assert.ok(error instanceof VaultProfileWriteGuardError);
      assert.equal(error.code, ACCESS_DENIED);
      return true;
    },
  );
});

test("own-scope put allows creator and denies other actors", async () => {
  const allow = serviceFor(
    repoStub({
      permissionsJson: OWN_PUT,
      hasProfileAssignment: true,
      itemCreatorId: "author",
    }),
  );
  await allow.assertSyncAppendAllowed({
    vaultId: "vault-1",
    userId: "author",
    eventType: "ITEM_UPDATE",
    referencedItemId: "1000000000000000001",
  });

  const deny = serviceFor(
    repoStub({
      permissionsJson: OWN_PUT,
      hasProfileAssignment: true,
      itemCreatorId: "author",
    }),
  );
  await assert.rejects(
    () =>
      deny.assertSyncAppendAllowed({
        vaultId: "vault-1",
        userId: "other",
        eventType: "ITEM_UPDATE",
        referencedItemId: "1000000000000000001",
      }),
    (error: unknown) => error instanceof VaultProfileWriteGuardError,
  );
});

test("ITEM_CREATE is denied when referenced item already has a creator", async () => {
  const service = serviceFor(
    repoStub({
      permissionsJson: OWN_PUT,
      hasProfileAssignment: true,
      itemCreatorId: "owner",
    }),
  );

  await assert.rejects(
    () =>
      service.assertSyncAppendAllowed({
        vaultId: "vault-1",
        userId: "own",
        eventType: "ITEM_CREATE",
        referencedItemId: "1000000000000000002",
      }),
    (error: unknown) => {
      assert.ok(error instanceof VaultProfileWriteGuardError);
      assert.equal(error.code, PROFILE_PERMISSION_DENIED);
      return true;
    },
  );
});

test("DEVICE_REMOVE and VAULT_CREATE require canManageVaultSettings", async () => {
  const denied = serviceFor(
    repoStub({ permissionsJson: EXTENDED, hasProfileAssignment: true }),
    { canManage: false },
  );
  for (const eventType of ["DEVICE_REMOVE", "VAULT_CREATE"] as const) {
    await assert.rejects(
      () =>
        denied.assertSyncAppendAllowed({
          vaultId: "vault-1",
          userId: "rw",
          eventType,
        }),
      (error: unknown) => error instanceof VaultProfileWriteGuardError,
    );
  }

  const allowed = serviceFor(
    repoStub({ permissionsJson: EXTENDED, hasProfileAssignment: true }),
    { canManage: true },
  );
  await allowed.assertSyncAppendAllowed({
    vaultId: "vault-1",
    userId: "owner",
    eventType: "DEVICE_REMOVE",
  });
});

test("Simple profile denies attachment upload/delete even when itemId equals workspaceId", async () => {
  const service = serviceFor(
    repoStub({
      permissionsJson: SIMPLE,
      hasProfileAssignment: true,
      workspaceId: "ws-logo",
    }),
  );

  await assert.rejects(
    () =>
      service.assertAttachmentAllowed({
        vaultId: "vault-1",
        userId: "ro",
        itemId: "ws-logo",
        method: "POST",
      }),
    (error: unknown) => error instanceof VaultProfileWriteGuardError,
  );
});

test("Simple profile denies attachment upload/delete; allows download", async () => {
  const service = serviceFor(
    repoStub({ permissionsJson: SIMPLE, hasProfileAssignment: true }),
  );

  await assert.rejects(
    () =>
      service.assertAttachmentAllowed({
        vaultId: "vault-1",
        userId: "ro",
        itemId: "1000000000000000001",
        method: "POST",
      }),
    (error: unknown) => error instanceof VaultProfileWriteGuardError,
  );
  await assert.rejects(
    () =>
      service.assertAttachmentAllowed({
        vaultId: "vault-1",
        userId: "ro",
        itemId: "1000000000000000001",
        method: "DELETE",
      }),
    (error: unknown) => error instanceof VaultProfileWriteGuardError,
  );

  await service.assertAttachmentAllowed({
    vaultId: "vault-1",
    userId: "ro",
    itemId: "1000000000000000001",
    method: "GET",
  });
});

test("soft-delete ITEM_UPDATE requires entries.delete", async () => {
  const putOnly = {
    ...EXTENDED,
    entries: {
      ...EXTENDED.entries,
      delete: 0 as const,
    },
  };
  const service = serviceFor(
    repoStub({
      permissionsJson: putOnly,
      hasProfileAssignment: true,
      itemCreatorId: "owner",
    }),
  );

  await assert.rejects(
    () =>
      service.assertSyncAppendAllowed({
        vaultId: "vault-1",
        userId: "rw",
        eventType: "ITEM_UPDATE",
        referencedItemId: "1000000000000000001",
        itemSoftDeleted: true,
      }),
    (error: unknown) => error instanceof VaultProfileWriteGuardError,
  );
});

test("put-only profile denies ITEM_UPDATE/ITEM_DELETE when item has no ITEM_CREATE", async () => {
  const putOnly = {
    ...EXTENDED,
    entries: {
      ...EXTENDED.entries,
      post: 0 as const,
      delete: 0 as const,
    },
  };
  const service = serviceFor(
    repoStub({
      permissionsJson: putOnly,
      hasProfileAssignment: true,
      itemCreatorId: null,
    }),
  );

  await assert.rejects(
    () =>
      service.assertSyncAppendAllowed({
        vaultId: "vault-1",
        userId: "editor",
        eventType: "ITEM_UPDATE",
        referencedItemId: "1000000000000000099",
        itemSoftDeleted: false,
      }),
    (error: unknown) => {
      assert.ok(error instanceof VaultProfileWriteGuardError);
      assert.equal(error.code, PROFILE_PERMISSION_DENIED);
      return true;
    },
  );

  await assert.rejects(
    () =>
      service.assertSyncAppendAllowed({
        vaultId: "vault-1",
        userId: "editor",
        eventType: "ITEM_DELETE",
        referencedItemId: "1000000000000000099",
      }),
    (error: unknown) => error instanceof VaultProfileWriteGuardError,
  );
});

test("attachment POST without ITEM_CREATE uses entries.post (Extended/owner allowed)", async () => {
  const service = serviceFor(
    repoStub({
      permissionsJson: EXTENDED,
      hasProfileAssignment: true,
      itemCreatorId: null,
    }),
  );

  await service.assertAttachmentAllowed({
    vaultId: "vault-1",
    userId: "owner",
    itemId: "1000000000000000097",
    method: "POST",
  });
});

test("attachment POST without ITEM_CREATE allowed for post-capable profile", async () => {
  const postOnly = {
    ...EXTENDED,
    entries: {
      ...EXTENDED.entries,
      put: 0 as const,
      delete: 0 as const,
    },
  };
  const service = serviceFor(
    repoStub({
      permissionsJson: postOnly,
      hasProfileAssignment: true,
      itemCreatorId: null,
    }),
  );

  await service.assertAttachmentAllowed({
    vaultId: "vault-1",
    userId: "creator",
    itemId: "1000000000000000096",
    method: "POST",
  });
});

test("attachment POST without ITEM_CREATE denied for put-only profile", async () => {
  const putOnly = {
    ...EXTENDED,
    entries: {
      ...EXTENDED.entries,
      post: 0 as const,
      delete: 0 as const,
    },
  };
  const service = serviceFor(
    repoStub({
      permissionsJson: putOnly,
      hasProfileAssignment: true,
      itemCreatorId: null,
    }),
  );

  await assert.rejects(
    () =>
      service.assertAttachmentAllowed({
        vaultId: "vault-1",
        userId: "editor",
        itemId: "1000000000000000097",
        method: "POST",
      }),
    (error: unknown) => {
      assert.ok(error instanceof VaultProfileWriteGuardError);
      assert.equal(error.code, PROFILE_PERMISSION_DENIED);
      return true;
    },
  );
});

test("attachment POST with existing ITEM_CREATE uses entries.put", async () => {
  const putOnly = {
    ...EXTENDED,
    entries: {
      ...EXTENDED.entries,
      post: 0 as const,
      delete: 0 as const,
    },
  };
  const allow = serviceFor(
    repoStub({
      permissionsJson: putOnly,
      hasProfileAssignment: true,
      itemCreatorId: "owner",
    }),
  );
  await allow.assertAttachmentAllowed({
    vaultId: "vault-1",
    userId: "editor",
    itemId: "1000000000000000001",
    method: "POST",
  });

  const extended = serviceFor(
    repoStub({
      permissionsJson: EXTENDED,
      hasProfileAssignment: true,
      itemCreatorId: "owner",
    }),
  );
  await extended.assertAttachmentAllowed({
    vaultId: "vault-1",
    userId: "owner",
    itemId: "1000000000000000001",
    method: "POST",
  });
});

test("put-only profile allows ITEM_UPDATE for existing item and denies ITEM_CREATE", async () => {
  const putOnly = {
    ...EXTENDED,
    entries: {
      ...EXTENDED.entries,
      post: 0 as const,
      delete: 0 as const,
    },
  };
  const service = serviceFor(
    repoStub({
      permissionsJson: putOnly,
      hasProfileAssignment: true,
      itemCreatorId: "owner",
    }),
  );

  await service.assertSyncAppendAllowed({
    vaultId: "vault-1",
    userId: "editor",
    eventType: "ITEM_UPDATE",
    referencedItemId: "1000000000000000001",
    itemSoftDeleted: false,
  });

  await assert.rejects(
    () =>
      service.assertSyncAppendAllowed({
        vaultId: "vault-1",
        userId: "editor",
        eventType: "ITEM_CREATE",
        referencedItemId: "1000000000000000098",
      }),
    (error: unknown) => error instanceof VaultProfileWriteGuardError,
  );
});
