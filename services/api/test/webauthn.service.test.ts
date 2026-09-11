import test from "node:test";
import assert from "node:assert/strict";
import { createTestApiConfig } from "./test-api-config.ts";
import {
  WebAuthnError,
  WebAuthnService,
} from "../src/webauthn/service.ts";
import type {
  PrimaryLoginMethod,
  WebAuthnAttachment,
  WebAuthnCredentialRecord,
  WebAuthnCredentialsRepository,
} from "../src/webauthn/repository.ts";

class InMemoryRedis {
  private readonly values = new Map<string, string>();

  async setWithTtl(key: string, value: string, _ttlSeconds: number): Promise<void> {
    this.values.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async del(key: string): Promise<number> {
    return this.values.delete(key) ? 1 : 0;
  }
}

class InMemoryWebAuthnRepo implements Pick<
  WebAuthnCredentialsRepository,
  | "listByUserId"
  | "listByUserAndAttachment"
  | "findByCredentialId"
  | "findByIdForUser"
  | "insert"
  | "updateSignCount"
  | "deleteByIdForUser"
  | "deleteByAttachment"
  | "getPrimaryLoginMethod"
  | "setPrimaryLoginMethod"
> {
  credentials: WebAuthnCredentialRecord[] = [];
  primary: PrimaryLoginMethod = "email";
  private seq = 1;

  async listByUserId(userId: string): Promise<WebAuthnCredentialRecord[]> {
    return this.credentials.filter((c) => c.userId === userId);
  }

  async listByUserAndAttachment(
    userId: string,
    attachment: WebAuthnAttachment,
  ): Promise<WebAuthnCredentialRecord[]> {
    return this.credentials.filter(
      (c) => c.userId === userId && c.authenticatorAttachment === attachment,
    );
  }

  async findByCredentialId(credentialId: string): Promise<WebAuthnCredentialRecord | null> {
    return this.credentials.find((c) => c.credentialId === credentialId) ?? null;
  }

  async findByIdForUser(
    userId: string,
    credentialRowId: string,
  ): Promise<WebAuthnCredentialRecord | null> {
    return (
      this.credentials.find((c) => c.userId === userId && c.id === credentialRowId) ?? null
    );
  }

  async insert(input: {
    userId: string;
    credentialId: string;
    publicKey: Uint8Array;
    signCount: number;
    transports: string[];
    authenticatorAttachment: WebAuthnAttachment;
    aaguid: string | null;
    name: string;
    backedUp: boolean;
  }): Promise<WebAuthnCredentialRecord> {
    const record: WebAuthnCredentialRecord = {
      id: String(this.seq++),
      userId: input.userId,
      credentialId: input.credentialId,
      publicKey: input.publicKey,
      signCount: input.signCount,
      transports: input.transports,
      authenticatorAttachment: input.authenticatorAttachment,
      aaguid: input.aaguid,
      name: input.name,
      backedUp: input.backedUp,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };
    this.credentials.push(record);
    return record;
  }

  async updateSignCount(credentialRowId: string, signCount: number): Promise<void> {
    const row = this.credentials.find((c) => c.id === credentialRowId);
    if (row) {
      row.signCount = signCount;
      row.lastUsedAt = new Date().toISOString();
    }
  }

  async deleteByIdForUser(userId: string, credentialRowId: string): Promise<boolean> {
    const before = this.credentials.length;
    this.credentials = this.credentials.filter(
      (c) => !(c.userId === userId && c.id === credentialRowId),
    );
    return this.credentials.length < before;
  }

  async deleteByAttachment(userId: string, attachment: WebAuthnAttachment): Promise<number> {
    const before = this.credentials.length;
    this.credentials = this.credentials.filter(
      (c) => !(c.userId === userId && c.authenticatorAttachment === attachment),
    );
    return before - this.credentials.length;
  }

  async getPrimaryLoginMethod(_userId: string): Promise<PrimaryLoginMethod> {
    return this.primary;
  }

  async setPrimaryLoginMethod(_userId: string, primary: PrimaryLoginMethod): Promise<void> {
    this.primary = primary;
  }
}

function createService(repo: InMemoryWebAuthnRepo, userExists = true) {
  const redis = new InMemoryRedis();
  const authStates: Array<{ email: string; userId: string; pendingTwoFactor: boolean }> = [];
  return {
    redis,
    authStates,
    service: new WebAuthnService({
      redis,
      credentials: repo as unknown as WebAuthnCredentialsRepository,
      users: {
        findByEmail: async (email) =>
          userExists
            ? {
                id: "user-1",
                email,
                publicKey: "pk",
                publicPqKey: null,
                locale: "en",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            : null,
        findById: async (id) =>
          id === "user-1"
            ? {
                id: "user-1",
                email: "a@okkey.app",
                publicKey: "pk",
                publicPqKey: null,
                locale: "en",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            : null,
        isTwoFactorEnabled: async () => false,
      },
      authService: {
        removeAuthState: async () => undefined,
        createAuthStateForExistingUser: async (params) => {
          authStates.push(params);
          return {
            authStateId: "state-1",
            nextStep: params.pendingTwoFactor ? "two_factor" : "device_check",
          };
        },
      },
      config: createTestApiConfig(),
      generateId: () => "challenge-1",
    }),
  };
}

test("discover returns email-only for unknown user", async () => {
  const repo = new InMemoryWebAuthnRepo();
  const { service } = createService(repo, false);
  const result = await service.discoverLoginMethods("new@okkey.app");
  assert.deepEqual(result, { primary: "email", methods: ["email"] });
});

test("discover includes passkey and hardware when credentials exist", async () => {
  const repo = new InMemoryWebAuthnRepo();
  repo.primary = "passkey";
  await repo.insert({
    userId: "user-1",
    credentialId: "cred-platform",
    publicKey: new Uint8Array([1]),
    signCount: 0,
    transports: ["internal"],
    authenticatorAttachment: "platform",
    aaguid: null,
    name: "Passkey",
    backedUp: true,
  });
  await repo.insert({
    userId: "user-1",
    credentialId: "cred-roaming",
    publicKey: new Uint8Array([2]),
    signCount: 0,
    transports: ["usb"],
    authenticatorAttachment: "cross-platform",
    aaguid: null,
    name: "Key",
    backedUp: false,
  });
  const { service } = createService(repo, true);
  const result = await service.discoverLoginMethods("a@okkey.app");
  assert.equal(result.primary, "passkey");
  assert.deepEqual(result.methods, ["email", "passkey", "hardware_key"]);
});

test("setPrimary rejects method without credentials", async () => {
  const repo = new InMemoryWebAuthnRepo();
  const { service } = createService(repo, true);
  await assert.rejects(
    () => service.setPrimary("user-1", "passkey"),
    (err: unknown) => err instanceof WebAuthnError && err.code === "WEBAUTHN_PRIMARY_INVALID",
  );
});

test("deleting last credential of primary method falls back to email", async () => {
  const repo = new InMemoryWebAuthnRepo();
  repo.primary = "hardware_key";
  const inserted = await repo.insert({
    userId: "user-1",
    credentialId: "cred-roaming",
    publicKey: new Uint8Array([2]),
    signCount: 0,
    transports: ["usb"],
    authenticatorAttachment: "cross-platform",
    aaguid: null,
    name: "Key",
    backedUp: false,
  });
  const { service } = createService(repo, true);
  const methods = await service.deleteCredential("user-1", inserted.id);
  assert.equal(methods.primary, "email");
  assert.equal(methods.hardwareKeys.length, 0);
  assert.equal(repo.primary, "email");
});

test("bulk delete by attachment clears method and primary", async () => {
  const repo = new InMemoryWebAuthnRepo();
  repo.primary = "passkey";
  await repo.insert({
    userId: "user-1",
    credentialId: "cred-a",
    publicKey: new Uint8Array([1]),
    signCount: 0,
    transports: [],
    authenticatorAttachment: "platform",
    aaguid: null,
    name: "A",
    backedUp: false,
  });
  await repo.insert({
    userId: "user-1",
    credentialId: "cred-b",
    publicKey: new Uint8Array([2]),
    signCount: 0,
    transports: [],
    authenticatorAttachment: "platform",
    aaguid: null,
    name: "B",
    backedUp: false,
  });
  const { service } = createService(repo, true);
  const methods = await service.deleteCredentialsByAttachment("user-1", "platform");
  assert.equal(methods.passkeys.length, 0);
  assert.equal(methods.primary, "email");
});
