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

function core(options?: { getError?: Error; grantError?: Error }) {
  const grants: string[] = [];
  const client = {
    api: { ready: true },
    getWorkspaceKey(this: { api?: { ready: boolean } }) {
      if (!this?.api) {
        throw new Error("this.api undefined");
      }
      if (options?.getError) {
        return Promise.reject(options.getError);
      }
      return Promise.resolve({
        current_version: 1,
        wraps: [{ key_version: 1, encrypted_workspace_key: { payload: "self" } }],
      });
    },
    listWorkspaceMembers(this: { api?: { ready: boolean } }) {
      if (!this?.api) {
        throw new Error("this.api undefined");
      }
      return Promise.resolve({
        members: [member(ACTOR), member(MEMBER), member("bad", INVALID_PK, VALID_PQ)],
        actorPermissions: { members: { get: 1, post: 1, put: 1, delete: 1 } },
      });
    },
    grantWorkspaceKeyWrap(
      this: { api?: { ready: boolean } },
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
  return { client, grants };
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
