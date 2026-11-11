import { describe, expect, it } from "vitest";

import {
  grantWorkspaceKeyToMember,
  tryCompletePendingWorkspaceKey,
  type PendingWorkspaceKeyRuntime,
} from "./completePendingWorkspaceKey";
import { canCompletePendingWorkspaceKey } from "./workspaceKeyAccess";

const ACCOUNT_KEY = Uint8Array.from({ length: 32 }, () => 7);
const VALID_PK = Buffer.alloc(32, 1).toString("base64");
const VALID_PQ = Buffer.alloc(1184, 2).toString("base64");
const INVALID_PK = Buffer.alloc(16, 3).toString("base64");
const ACTOR = "2000000000000000001";
const MEMBER = "2000000000000000002";

class ApiRequestError extends Error {
  readonly status: number;
  readonly body: { error: string; message: string; requestId: string };

  constructor(status: number, code: string) {
    super(code);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = { error: code, message: code, requestId: "req" };
  }
}

function runtime(): PendingWorkspaceKeyRuntime {
  return {
    readVaultBundle: () => ({ encrypted_private_key: { payload: "bundle" } }),
    decryptUserIdentityFromEncryptedBlob: async () => ({
      ed25519SecretKey: Uint8Array.from([1]),
      mlkem768DecapsulationKey: Uint8Array.from([2]),
    }),
    unwrapWorkspaceKeyForSelf: async () => Uint8Array.from({ length: 32 }, (_, index) => index + 1),
    wrapWorkspaceKeyForMember: async (input) => ({
      crypto_version: 2,
      algorithm: "opaque",
      payload: `wrap:${input.recipientUserId}`,
      meta: { entity: "workspace_key_wrap", key_version: input.keyVersion },
    }),
    generateWorkspaceKey: async () => Uint8Array.from({ length: 32 }, () => 9),
    base64ToBytes: (value) => Uint8Array.from(Buffer.from(value, "base64")),
  };
}

function member(userId: string, publicKey = VALID_PK, publicPqKey: string | null = VALID_PQ) {
  return {
    userId,
    email: `${userId}@example.com`,
    firstName: null,
    lastName: null,
    publicKey,
    publicPqKey,
    roleId: null,
    roleBuiltinKey: userId === ACTOR ? "owner" : "user",
    roleName: null,
    status: "active" as const,
    invitationId: null,
    invitedAt: null,
    invitedBy: null,
    roleChangedAt: null,
    roleChangedBy: null,
    joinedAt: null,
    lastLoginAt: null,
  };
}

function core(options?: {
  getError?: Error;
  grantError?: Error;
  holdsKey?: boolean;
  removedUserIds?: string[];
  pendingUserIds?: string[];
  members?: ReturnType<typeof member>[];
}) {
  const grants: string[] = [];
  const calls: string[] = [];
  const posted: unknown[] = [];
  const http = {
    async get(this: { post?: unknown }, path: string) {
      if (!this.post) {
        throw new Error("this.api undefined");
      }
      calls.push(path);
      if (path.endsWith("/pending-rotations")) {
        return { removed_user_ids: options?.removedUserIds ?? [] };
      }
      if (path.endsWith("/pending-recipients")) {
        return {
          user_ids: options?.pendingUserIds ?? [MEMBER, "bad"],
        };
      }
      throw new Error(`unexpected get ${path}`);
    },
    async post(this: { get?: unknown }, path: string, body: unknown) {
      if (!this.get) {
        throw new Error("this.api undefined");
      }
      calls.push(path);
      posted.push(body);
      return { current_version: 2 };
    },
  };
  const holdsKey = options?.holdsKey !== false;
  const client = {
    api: http,
    getHttpClient(this: { api?: typeof http }) {
      if (!this.api) {
        throw new Error("this.api undefined");
      }
      return this.api;
    },
    getWorkspaceKey(this: { api?: typeof http }) {
      if (!this?.api) {
        throw new Error("this.api undefined");
      }
      if (options?.getError) {
        return Promise.reject(options.getError);
      }
      return Promise.resolve({
        current_version: 1,
        wraps: holdsKey ? [{ key_version: 1, encrypted_workspace_key: { payload: "self" } }] : [],
      });
    },
    listWorkspaceMembers(this: { api?: typeof http }) {
      if (!this?.api) {
        throw new Error("this.api undefined");
      }
      return Promise.resolve({
        members: options?.members ?? [member(ACTOR), member(MEMBER), member("bad", INVALID_PK, VALID_PQ)],
        actorPermissions: { members: { get: 1, post: 1, put: 1, delete: 1 } },
      });
    },
    deleteWorkspaceMember(this: { api?: typeof http }) {
      if (!this?.api) {
        throw new Error("this.api undefined");
      }
      return Promise.resolve({ deleted: true as const });
    },
    grantWorkspaceKeyWrap(
      this: { api?: typeof http },
      _workspaceId: string,
      body: { user_id: string },
    ) {
      if (!this?.api) {
        throw new Error("this.api undefined");
      }
      if (options?.grantError) {
        return Promise.reject(options.grantError);
      }
      grants.push(body.user_id);
      return Promise.resolve({ key_version: 1 });
    },
  };
  return { client, grants, calls, posted };
}

describe("tryCompletePendingWorkspaceKey", () => {
  it("grants the current key to other active members and skips an invalid public key", async () => {
    const { client, grants } = core();
    const result = await tryCompletePendingWorkspaceKey(
      {
        core: client as never,
        workspaceId: "w1",
        userId: ACTOR,
        accountVaultKey: ACCOUNT_KEY,
      },
      runtime(),
    );
    expect(grants).toEqual([MEMBER]);
    expect(result).toEqual({ granted: 1, skippedInvalidKeys: 1 });
  });

  it("swallows a missing workspace key", async () => {
    const { client, grants } = core({ getError: new ApiRequestError(404, "WORKSPACE_KEY_MISSING") });
    const result = await tryCompletePendingWorkspaceKey(
      {
        core: client as never,
        workspaceId: "w1",
        userId: ACTOR,
        accountVaultKey: ACCOUNT_KEY,
      },
      runtime(),
    );
    expect(grants).toEqual([]);
    expect(result).toEqual({ granted: 0, skippedInvalidKeys: 0 });
  });

  it("treats an existing wrap as already granted", async () => {
    const { client } = core({
      grantError: new ApiRequestError(409, "WORKSPACE_KEY_WRAP_EXISTS"),
    });
    const result = await tryCompletePendingWorkspaceKey(
      {
        core: client as never,
        workspaceId: "w1",
        userId: ACTOR,
        accountVaultKey: ACCOUNT_KEY,
      },
      runtime(),
    );
    expect(result).toEqual({ granted: 0, skippedInvalidKeys: 1 });
  });

  it("does nothing when the caller does not hold the current key", async () => {
    const { client, grants, calls } = core({ holdsKey: false });
    const result = await tryCompletePendingWorkspaceKey(
      {
        core: client as never,
        workspaceId: "w1",
        userId: ACTOR,
        accountVaultKey: ACCOUNT_KEY,
      },
      runtime(),
    );
    expect(result).toEqual({ granted: 0, skippedInvalidKeys: 0 });
    expect(grants).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("rotates for remaining members before wrapping new members", async () => {
    const removed = "2000000000000000009";
    const added = "2000000000000000008";
    const { client, grants, calls, posted } = core({
      removedUserIds: [removed],
      pendingUserIds: [added],
      members: [member(ACTOR), member(MEMBER), member(removed), member(added)],
    });
    const result = await tryCompletePendingWorkspaceKey(
      {
        core: client as never,
        workspaceId: "w1",
        userId: ACTOR,
        accountVaultKey: ACCOUNT_KEY,
      },
      runtime(),
    );
    expect(calls[0]).toContain("/pending-rotations");
    expect(calls.some((path) => path.endsWith("/deferred-rotation"))).toBe(true);
    const rotationIndex = calls.findIndex((path) => path.endsWith("/deferred-rotation"));
    const recipientsIndex = calls.findIndex((path) => path.endsWith("/pending-recipients"));
    expect(rotationIndex).toBeGreaterThanOrEqual(0);
    expect(recipientsIndex).toBeGreaterThan(rotationIndex);
    const body = posted[0] as { wraps: Array<{ user_id: string }> };
    expect(body.wraps.map((wrap) => wrap.user_id).sort()).toEqual([ACTOR, MEMBER, added].sort());
    expect(body.wraps.some((wrap) => wrap.user_id === removed)).toBe(false);
    expect(grants).toEqual([added]);
    expect(result.granted).toBe(1);
  });
});

describe("grantWorkspaceKeyToMember", () => {
  it("grants a wrap when a member is added", async () => {
    const { client, grants } = core();
    await grantWorkspaceKeyToMember(
      {
        core: client as never,
        workspaceId: "w1",
        userId: ACTOR,
        accountVaultKey: ACCOUNT_KEY,
        member: member(MEMBER),
      },
      runtime(),
    );
    expect(grants).toEqual([MEMBER]);
  });
});

describe("canCompletePendingWorkspaceKey", () => {
  it("requires members.get", () => {
    expect(canCompletePendingWorkspaceKey(null)).toBe(false);
    expect(
      canCompletePendingWorkspaceKey({
        members: { get: 0, post: 0, put: 0, delete: 0 },
      } as never),
    ).toBe(false);
    expect(
      canCompletePendingWorkspaceKey({
        members: { get: 1, post: 0, put: 0, delete: 0 },
      } as never),
    ).toBe(true);
  });
});
