import assert from "node:assert/strict";
import test from "node:test";

import {
  WorkspaceKeyService,
  WorkspaceKeyServiceError,
  type WorkspaceKeyWrapInput,
} from "../src/workspace-key/service.ts";
import type {
  WorkspaceClientSettingsRecord,
  WorkspaceKeyStore,
  WorkspaceKeyWrapRecord,
  WorkspaceLogoRecord,
} from "../src/workspace-key/store.ts";
import { workspaceLogoQuotaDelta } from "../src/storage-quota/workspace-logo-bytes.ts";
import { WorkspaceMembersService } from "../src/workspace-members/service.ts";

const WORKSPACE_ID = "1000000000000000001";
const OWNER_ID = "2000000000000000001";
const MEMBER_ID = "2000000000000000002";
const REMOVED_ID = "2000000000000000003";

function wrap(userId: string, version: number): WorkspaceKeyWrapInput {
  return {
    userId,
    encryptedWorkspaceKey: {
      crypto_version: 2,
      algorithm: "opaque",
      payload: Buffer.from(`workspace-key:${userId}:${version}`).toString("base64"),
      meta: {
        entity: "workspace_key_wrap",
        key_version: version,
        recipient_user_id: userId,
      },
    },
  };
}

function frame(version: number, payload = "logo-bytes"): Uint8Array {
  const body = new TextEncoder().encode(payload);
  const out = new Uint8Array(4 + 24 + 16 + body.length);
  new DataView(out.buffer).setUint32(0, version, false);
  out.set(body, 44);
  return out;
}

class MemoryWorkspaceKeyStore implements WorkspaceKeyStore {
  members = [OWNER_ID, MEMBER_ID, REMOVED_ID];
  wraps: WorkspaceKeyWrapRecord[] = [];
  logo: WorkspaceLogoRecord | null = null;
  clientSettings: WorkspaceClientSettingsRecord | null = null;
  tileColor: string | null = null;
  rotationQueue: string[] = [];

  async currentVersion(): Promise<number | null> {
    const versions = this.wraps.map((wrap) => wrap.keyVersion);
    if (versions.length === 0) {
      return null;
    }
    return Math.max(...versions);
  }

  async activeMemberIds(): Promise<string[]> {
    return [...this.members];
  }

  async wrapsForUser(_workspaceId: string, userId: string): Promise<WorkspaceKeyWrapRecord[]> {
    return this.wraps
      .filter((wrap) => wrap.userId === userId)
      .sort((a, b) => a.keyVersion - b.keyVersion);
  }

  async insertWraps(_workspaceId: string, wraps: WorkspaceKeyWrapRecord[]): Promise<void> {
    for (const wrap of wraps) {
      if (
        this.wraps.some(
          (existing) => existing.userId === wrap.userId && existing.keyVersion === wrap.keyVersion,
        )
      ) {
        throw new Error("duplicate wrap");
      }
      this.wraps.push(wrap);
    }
  }

  async deleteUserWraps(_workspaceId: string, userId: string): Promise<void> {
    this.wraps = this.wraps.filter((wrap) => wrap.userId !== userId);
  }

  async enqueueRotation(_workspaceId: string, removedUserId: string): Promise<void> {
    if (!this.rotationQueue.includes(removedUserId)) {
      this.rotationQueue.push(removedUserId);
    }
  }

  async listRotationQueue(): Promise<string[]> {
    return [...this.rotationQueue];
  }

  async clearRotationQueue(): Promise<void> {
    this.rotationQueue = [];
  }

  async listMembersLackingCurrentWrap(): Promise<string[]> {
    const version = await this.currentVersion();
    if (version == null) {
      return [];
    }
    const queued = new Set(this.rotationQueue);
    return this.members.filter(
      (userId) =>
        !queued.has(userId) &&
        !this.wraps.some((wrap) => wrap.userId === userId && wrap.keyVersion === version),
    );
  }

  async getLogo(): Promise<WorkspaceLogoRecord | null> {
    return this.logo;
  }

  async putLogo(
    _workspaceId: string,
    logo: { keyVersion: number; ciphertext: Uint8Array },
  ): Promise<{ previousBytes: number; updatedAt: string }> {
    const previousBytes = this.logo?.ciphertextBytes ?? 0;
    const updatedAt = "2026-01-01T00:00:00.000Z";
    this.logo = {
      keyVersion: logo.keyVersion,
      ciphertext: logo.ciphertext,
      ciphertextBytes: logo.ciphertext.length,
      updatedAt,
    };
    return { previousBytes, updatedAt };
  }

  async deleteLogo(): Promise<number> {
    const previous = this.logo?.ciphertextBytes ?? 0;
    this.logo = null;
    return previous;
  }

  async getClientSettings(): Promise<WorkspaceClientSettingsRecord | null> {
    return this.clientSettings;
  }

  async putClientSettings(
    _workspaceId: string,
    input: { keyVersion: number; ciphertext: Uint8Array; tileColor?: string | null },
  ): Promise<void> {
    this.clientSettings = { keyVersion: input.keyVersion, ciphertext: input.ciphertext };
    if (input.tileColor !== undefined) {
      this.tileColor = input.tileColor;
    }
  }
}

function allowAll() {
  return {
    async assertMember() {},
    async assertSettingsPut() {},
  };
}

test("workspace key wraps are per member and rotation drops the removed member", async () => {
  const store = new MemoryWorkspaceKeyStore();
  const service = new WorkspaceKeyService(store, allowAll());

  await service.publishVersion1(WORKSPACE_ID, OWNER_ID, [
    wrap(OWNER_ID, 1),
    wrap(MEMBER_ID, 1),
    wrap(REMOVED_ID, 1),
  ]);

  const owner = await service.getForMember(WORKSPACE_ID, OWNER_ID);
  const removed = await service.getForMember(WORKSPACE_ID, REMOVED_ID);
  assert.equal(owner.currentVersion, 1);
  assert.deepEqual(
    owner.wraps.map((item) => item.encryptedWorkspaceKey.meta.recipient_user_id),
    [OWNER_ID],
  );
  assert.equal(removed.wraps.length, 1);
  assert.notEqual(
    owner.wraps[0]?.encryptedWorkspaceKey.payload,
    removed.wraps[0]?.encryptedWorkspaceKey.payload,
  );

  await assert.rejects(
    () => service.rotateOnRemoval(WORKSPACE_ID, REMOVED_ID, null),
    (error: unknown) => error instanceof WorkspaceKeyServiceError && error.code === "WORKSPACE_KEY_ROTATION_REQUIRED",
  );

  await assert.rejects(
    () =>
      service.rotateOnRemoval(WORKSPACE_ID, REMOVED_ID, [
        wrap(OWNER_ID, 2),
        wrap(REMOVED_ID, 2),
      ]),
    (error: unknown) => error instanceof WorkspaceKeyServiceError && error.code === "WORKSPACE_KEY_WRAP_SET_MISMATCH",
  );

  const rotated = await service.rotateOnRemoval(WORKSPACE_ID, REMOVED_ID, [
    wrap(OWNER_ID, 2),
    wrap(MEMBER_ID, 2),
  ]);
  assert.equal(rotated?.nextVersion, 2);
  store.members = store.members.filter((id) => id !== REMOVED_ID);

  const removedAfter = await service.getForMember(WORKSPACE_ID, REMOVED_ID);
  assert.equal(removedAfter.wraps.length, 0);
  const ownerAfter = await service.getForMember(WORKSPACE_ID, OWNER_ID);
  assert.deepEqual(
    ownerAfter.wraps.map((item) => item.keyVersion),
    [1, 2],
  );
  assert.equal(ownerAfter.currentVersion, 2);
});

test("a new member receives a wrap of the current version only", async () => {
  const store = new MemoryWorkspaceKeyStore();
  store.members = [OWNER_ID];
  const service = new WorkspaceKeyService(store, allowAll());
  await service.publishVersion1(WORKSPACE_ID, OWNER_ID, [wrap(OWNER_ID, 1)]);
  store.members = [OWNER_ID, MEMBER_ID];
  await service.grantCurrentWrap(WORKSPACE_ID, OWNER_ID, wrap(MEMBER_ID, 1));
  const member = await service.getForMember(WORKSPACE_ID, MEMBER_ID);
  assert.deepEqual(
    member.wraps.map((item) => item.keyVersion),
    [1],
  );
  await assert.rejects(
    () => service.grantCurrentWrap(WORKSPACE_ID, OWNER_ID, wrap(MEMBER_ID, 1)),
    (error: unknown) => error instanceof WorkspaceKeyServiceError && error.code === "WORKSPACE_KEY_WRAP_EXISTS",
  );
});

test("logo writes must use the current key version and quota follows ciphertext length", async () => {
  const store = new MemoryWorkspaceKeyStore();
  store.members = [OWNER_ID];
  const service = new WorkspaceKeyService(store, {
    async assertMember() {},
    async assertSettingsPut(workspaceId, userId) {
      if (userId !== OWNER_ID) {
        throw new WorkspaceKeyServiceError("ACCESS_DENIED", 403, "access denied");
      }
      void workspaceId;
    },
  });
  await service.publishVersion1(WORKSPACE_ID, OWNER_ID, [wrap(OWNER_ID, 1)]);

  await assert.rejects(
    () => service.putLogo(WORKSPACE_ID, MEMBER_ID, frame(1)),
    (error: unknown) => error instanceof WorkspaceKeyServiceError && error.statusCode === 403,
  );

  const first = frame(1, "first-logo");
  const created = await service.putLogo(WORKSPACE_ID, OWNER_ID, first);
  assert.equal(created.ciphertextBytes, first.length);
  assert.deepEqual(created.quota, workspaceLogoQuotaDelta(0, first.length));
  assert.equal(created.quota.usageBytes, first.length);

  store.members = [OWNER_ID, REMOVED_ID];
  await service.rotateOnRemoval(WORKSPACE_ID, REMOVED_ID, [wrap(OWNER_ID, 2)]);
  await assert.rejects(
    () => service.putLogo(WORKSPACE_ID, OWNER_ID, frame(1, "stale")),
    (error: unknown) =>
      error instanceof WorkspaceKeyServiceError && error.code === "WORKSPACE_KEY_VERSION_MISMATCH",
  );

  const next = frame(2, "rotated-logo");
  const replaced = await service.putLogo(WORKSPACE_ID, OWNER_ID, next);
  assert.equal(replaced.quota.additionalBytes, next.length);
  assert.equal(replaced.quota.replacedBytes, first.length);
  assert.equal(replaced.quota.usageBytes, next.length);
  assert.notEqual(replaced.quota.usageBytes, first.length + next.length);

  const memberRead = new WorkspaceKeyService(store, {
    async assertMember(_workspaceId, userId) {
      if (userId === "outsider") {
        throw new WorkspaceKeyServiceError("ACCESS_DENIED", 403, "access denied");
      }
    },
    async assertSettingsPut() {
      throw new WorkspaceKeyServiceError("ACCESS_DENIED", 403, "access denied");
    },
  });
  const logo = await memberRead.getLogo(WORKSPACE_ID, MEMBER_ID);
  assert.equal(logo.keyVersion, 2);
  assert.equal(logo.ciphertextBytes, next.length);
  await assert.rejects(
    () => memberRead.getLogo(WORKSPACE_ID, "outsider"),
    (error: unknown) => error instanceof WorkspaceKeyServiceError && error.statusCode === 403,
  );

  const removed = await service.deleteLogo(WORKSPACE_ID, OWNER_ID);
  assert.equal(removed.usageBytes, 0);
  assert.equal(removed.replacedBytes, next.length);
  assert.equal(removed.additionalBytes, 0);
  assert.equal(await store.getLogo(), null);
});

test("logo upload is rejected by storage quota before the ciphertext is stored", async () => {
  const store = new MemoryWorkspaceKeyStore();
  store.members = [OWNER_ID];
  const service = new WorkspaceKeyService(
    store,
    allowAll(),
    {
      async assertLogoWrite(input) {
        assert.equal(input.replacedBytes, 0);
        assert.ok(input.additionalBytes > 0);
        throw new WorkspaceKeyServiceError("PLAN_QUOTA_EXCEEDED", 403, "storage limit");
      },
    },
  );
  await service.publishVersion1(WORKSPACE_ID, OWNER_ID, [wrap(OWNER_ID, 1)]);
  const ciphertext = frame(1, "over-quota");
  await assert.rejects(
    () => service.putLogo(WORKSPACE_ID, OWNER_ID, ciphertext),
    (error: unknown) => error instanceof WorkspaceKeyServiceError && error.code === "PLAN_QUOTA_EXCEEDED",
  );
  assert.equal(await store.getLogo(), null);

  const allowed = new WorkspaceKeyService(store, allowAll(), {
    async assertLogoWrite(input) {
      if (input.replacedBytes === 0) {
        return;
      }
      assert.equal(input.replacedBytes, ciphertext.length);
      assert.equal(input.additionalBytes, ciphertext.length);
    },
  });
  await allowed.putLogo(WORKSPACE_ID, OWNER_ID, ciphertext);
  await allowed.putLogo(WORKSPACE_ID, OWNER_ID, ciphertext);
  assert.equal((await store.getLogo())?.ciphertextBytes, ciphertext.length);
});

test("client settings writes reject an older key version", async () => {
  const store = new MemoryWorkspaceKeyStore();
  store.members = [OWNER_ID];
  const service = new WorkspaceKeyService(store, allowAll());
  await service.publishVersion1(WORKSPACE_ID, OWNER_ID, [wrap(OWNER_ID, 1)]);
  const stale = frame(1, "{\"tileColor\":\"#112233\"}");
  const saved = await service.putClientSettings(WORKSPACE_ID, OWNER_ID, {
    ciphertext: stale,
    tileColor: "#112233",
  });
  assert.equal(saved.keyVersion, 1);
  assert.equal(store.tileColor, "#112233");

  store.wraps.push(wrapRecord(OWNER_ID, 2));
  await assert.rejects(
    () => service.putClientSettings(WORKSPACE_ID, OWNER_ID, { ciphertext: stale }),
    (error: unknown) =>
      error instanceof WorkspaceKeyServiceError && error.code === "WORKSPACE_KEY_VERSION_MISMATCH",
  );
  const current = frame(2, "{\"tileColor\":\"#abcdef\"}");
  await service.putClientSettings(WORKSPACE_ID, OWNER_ID, { ciphertext: current });
  const stored = await service.getClientSettings(WORKSPACE_ID, MEMBER_ID);
  assert.equal(stored?.keyVersion, 2);
  assert.equal(stored?.ciphertext.length, current.length);
});

function wrapRecord(userId: string, version: number): WorkspaceKeyWrapRecord {
  const input = wrap(userId, version);
  return {
    userId,
    keyVersion: version,
    encryptedWorkspaceKey: input.encryptedWorkspaceKey,
  };
}

test("removeMember asks for workspace-key rotation before deleting membership", async () => {
  const sql: string[] = [];
  const db = {
    async query<T>(statement: string): Promise<T[]> {
      sql.push(statement);
      if (/SELECT owner_id FROM workspaces/.test(statement)) {
        return [{ owner_id: OWNER_ID }] as T[];
      }
      if (/SELECT id, invited_by_user_id FROM workspace_members/.test(statement)) {
        return [{ id: "6000000000000000001", invited_by_user_id: OWNER_ID }] as T[];
      }
      return [] as T[];
    },
  };
  let rotatedBeforeDelete = false;
  const service = new WorkspaceMembersService({
    db,
    workspaces: {
      async findById() {
        return { id: WORKSPACE_ID, ownerId: OWNER_ID } as never;
      },
      async hasAccess() {
        return true;
      },
    },
    workspaceKeys: {
      async rotateOnRemoval() {
        rotatedBeforeDelete = !sql.some((statement) => /DELETE FROM workspace_members/.test(statement));
        return { nextVersion: 2 };
      },
    },
  });
  await service.removeMember(WORKSPACE_ID, OWNER_ID, MEMBER_ID, { wraps: [] });
  assert.equal(rotatedBeforeDelete, true);
  assert.equal(sql.some((statement) => /DELETE FROM workspace_members/.test(statement)), true);
});

test("removeMember keeps membership when workspace-key rotation is refused", async () => {
  const sql: string[] = [];
  const db = {
    async query<T>(statement: string): Promise<T[]> {
      sql.push(statement);
      if (/SELECT owner_id FROM workspaces/.test(statement)) {
        return [{ owner_id: OWNER_ID }] as T[];
      }
      if (/SELECT id, invited_by_user_id FROM workspace_members/.test(statement)) {
        return [{ id: "6000000000000000001", invited_by_user_id: OWNER_ID }] as T[];
      }
      return [] as T[];
    },
  };
  const service = new WorkspaceMembersService({
    db,
    workspaces: {
      async findById() {
        return { id: WORKSPACE_ID, ownerId: OWNER_ID } as never;
      },
      async hasAccess() {
        return true;
      },
    },
    workspaceKeys: {
      async rotateOnRemoval() {
        throw new WorkspaceKeyServiceError(
          "WORKSPACE_KEY_ROTATION_REQUIRED",
          409,
          "removing a member requires a new workspace key version wrapped for the remaining members",
        );
      },
    },
  });
  await assert.rejects(() => service.removeMember(WORKSPACE_ID, OWNER_ID, MEMBER_ID, null), {
    code: "WORKSPACE_KEY_ROTATION_REQUIRED",
    statusCode: 409,
  });
  assert.equal(sql.some((statement) => /DELETE FROM workspace_members/.test(statement)), false);
});

test("removeMemberWithoutKeyHolder queues the removal and drops wraps without a new version", async () => {
  const store = new MemoryWorkspaceKeyStore();
  store.members = [OWNER_ID, REMOVED_ID];
  const keys = new WorkspaceKeyService(store, allowAll());
  await keys.publishVersion1(WORKSPACE_ID, OWNER_ID, [wrap(OWNER_ID, 1), wrap(REMOVED_ID, 1)]);

  const sql: string[] = [];
  const members = new WorkspaceMembersService({
    db: {
      async query<T>(statement: string): Promise<T[]> {
        sql.push(statement);
        if (/SELECT owner_id FROM workspaces/.test(statement)) {
          return [{ owner_id: OWNER_ID }] as T[];
        }
        if (/SELECT id, invited_by_user_id FROM workspace_members/.test(statement)) {
          return [{ id: "6000000000000000001", invited_by_user_id: OWNER_ID }] as T[];
        }
        return [] as T[];
      },
    },
    workspaces: {
      async findById() {
        return { id: WORKSPACE_ID, ownerId: OWNER_ID } as never;
      },
      async hasAccess() {
        return true;
      },
    },
    workspaceKeys: keys,
  });

  await members.removeMemberWithoutKeyHolder(WORKSPACE_ID, OWNER_ID, REMOVED_ID);
  assert.equal(sql.some((statement) => /DELETE FROM workspace_members/.test(statement)), true);
  assert.equal((await keys.getForMember(WORKSPACE_ID, REMOVED_ID)).wraps.length, 0);
  assert.equal((await keys.getForMember(WORKSPACE_ID, OWNER_ID)).currentVersion, 1);
  assert.deepEqual(await keys.listPendingRotations(WORKSPACE_ID, OWNER_ID), [REMOVED_ID]);
  assert.equal(
    store.wraps.some((item) => item.keyVersion === 2),
    false,
  );
  await assert.rejects(
    () => keys.applyDeferredRotation(WORKSPACE_ID, OWNER_ID, [wrap(REMOVED_ID, 2)]),
    (error: unknown) =>
      error instanceof WorkspaceKeyServiceError && error.code === "WORKSPACE_KEY_WRAP_SET_MISMATCH",
  );

  const rotated = await keys.applyDeferredRotation(WORKSPACE_ID, OWNER_ID, [wrap(OWNER_ID, 2)]);
  assert.equal(rotated?.nextVersion, 2);
  assert.deepEqual(await keys.listPendingRotations(WORKSPACE_ID, OWNER_ID), []);
  assert.deepEqual(
    (await keys.getForMember(WORKSPACE_ID, OWNER_ID)).wraps.map((item) => item.keyVersion),
    [1, 2],
  );
  assert.equal(await keys.applyDeferredRotation(WORKSPACE_ID, OWNER_ID, [wrap(OWNER_ID, 3)]), null);
});
