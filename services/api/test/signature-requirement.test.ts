import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initSync } from "@okkey/crypto-wasm";
import {
  MLDSA65_SEED_LEN,
  buildHybridSignatureEnvelopeV2,
  ed25519Keypair,
  generatePQKeys,
  mldsa65Keypair,
} from "@okkey/crypto";
import type { HybridSignatureEnvelopeV2 } from "@okkey/crypto";
import type { QueryExecutor } from "../src/storage/postgres.ts";
import { SyncService, SyncServiceError } from "../src/sync/service.ts";
import { VaultSharingService, VaultSharingServiceError } from "../src/vault-sharing/service.ts";
import {
  CRITICAL_SIGNATURE_OPERATIONS,
  PERSONAL_WORKSPACE_EVENT_TYPES,
  isSignatureRequired,
} from "../src/crypto/signature-requirement.ts";
import type { CryptoRolloutMode } from "../src/crypto/policy-matrix.ts";

const ACTOR_ID = "1000000000000000003";
const RECIPIENT_ID = "1000000000000000004";
const VAULT_ID = "1000000000000000002";
const WORKSPACE_ID = "1000000000000000001";

const cryptoDist = join(dirname(fileURLToPath(import.meta.url)), "../../../packages/crypto/dist");
let wasmReady = false;

function ensureWasm(): void {
  if (wasmReady) {
    return;
  }
  initSync(readFileSync(join(cryptoDist, "okkey_crypto_engine_bg.wasm")));
  wasmReady = true;
}

interface Signer {
  secret: Uint8Array;
  publicKey: string;
  publicPqKey: string;
  publicMldsaKey: string;
  pqPublic: Uint8Array;
  mldsaSeed: Uint8Array;
  mldsaPublic: Uint8Array;
}

function createSigner(): Signer {
  ensureWasm();
  const identity = ed25519Keypair();
  const secret = identity.slice(0, 32);
  const publicKeyBytes = identity.slice(32, 64);
  const pqPublic = generatePQKeys().slice(2400);
  const mldsa = mldsa65Keypair();
  const mldsaSeed = mldsa.slice(0, MLDSA65_SEED_LEN);
  const mldsaPublic = mldsa.slice(MLDSA65_SEED_LEN);
  const probe = buildHybridSignatureEnvelopeV2({
    keyId: "probe",
    context: "vault.share",
    payload: { probe: true },
    signerPrivateKey: secret,
    signerMlDsaSeed: mldsaSeed,
    signerPqPublicKey: pqPublic,
    signerMlDsaPublicKey: mldsaPublic,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  return {
    secret,
    publicKey: Buffer.from(publicKeyBytes).toString("base64"),
    publicPqKey: probe.signer_pq_public_key,
    publicMldsaKey: probe.signer_mldsa_public_key,
    pqPublic,
    mldsaSeed,
    mldsaPublic,
  };
}

function eventBlob(entity: string, eventType: string, payload = "event") {
  return {
    crypto_version: 2,
    algorithm: "opaque",
    payload: Buffer.from(payload).toString("base64"),
    meta: {
      entity,
      event_type: eventType,
    },
  };
}

function wrapBlob(userId: string) {
  return {
    crypto_version: 2,
    algorithm: "opaque",
    payload: Buffer.from(`wrap-${userId}`).toString("base64"),
    meta: {
      key_wrap_scheme: "hybrid_ecc_pq_v1",
      recipient_user_id: userId,
    },
  };
}

function sign(input: {
  signer: Signer;
  context: HybridSignatureEnvelopeV2["context"];
  vaultId: string;
  eventType: string;
  encryptedBlob: ReturnType<typeof eventBlob>;
}): HybridSignatureEnvelopeV2 {
  return buildHybridSignatureEnvelopeV2({
    keyId: "k1",
    context: input.context,
    payload: {
      vaultId: input.vaultId,
      eventType: input.eventType,
      encryptedBlob: input.encryptedBlob,
    },
    signerPrivateKey: input.signer.secret,
    signerMlDsaSeed: input.signer.mldsaSeed,
    signerPqPublicKey: input.signer.pqPublic,
    signerMlDsaPublicKey: input.signer.mldsaPublic,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
}

function corruptSignature(envelope: HybridSignatureEnvelopeV2): HybridSignatureEnvelopeV2 {
  const flipped = envelope.signature.endsWith("A") ? "B" : "A";
  return {
    ...envelope,
    signature: `${envelope.signature.slice(0, -1)}${flipped}`,
  };
}

function answerQuery(sql: string, params: unknown[] | undefined, activeUserIds: string[]): unknown[] {
  if (sql.includes("workspace_owner_id")) {
    return [
      {
        vault_id: VAULT_ID,
        workspace_id: WORKSPACE_ID,
        workspace_owner_id: ACTOR_ID,
        vault_owner_id: ACTOR_ID,
        role: "owner",
      },
    ];
  }
  if (sql.includes("SELECT public_key, public_pq_key")) {
    return [{
      public_key: signerKeys.publicKey,
      public_pq_key: signerKeys.publicPqKey,
      public_mldsa_key: signerKeys.publicMldsaKey,
    }];
  }
  if (sql.includes("AS can_access")) {
    return [{ can_access: true }];
  }
  if (sql.includes("SELECT id, public_pq_key")) {
    const ids = Array.isArray(params?.[0]) ? (params[0] as string[]) : activeUserIds;
    return ids.map((id) => ({ id, public_pq_key: signerKeys.publicPqKey }));
  }
  if (sql.includes("SELECT public_pq_key FROM users")) {
    return [{ public_pq_key: signerKeys.publicPqKey }];
  }
  if (sql.includes("crypto_version FROM vaults")) {
    return [{ id: VAULT_ID, crypto_version: 2 }];
  }
  if (sql.includes("SELECT id FROM vaults")) {
    return [{ id: VAULT_ID }];
  }
  if (sql.includes("SELECT id FROM vault_members")) {
    return [{ id: "membership" }];
  }
  if (sql.includes("SELECT DISTINCT user_id")) {
    return activeUserIds.map((user_id) => ({ user_id }));
  }
  if (sql.includes("COALESCE(MAX(version)")) {
    return [{ current_version: 0 }];
  }
  if (sql.includes("MAX(payload_schema_version)")) {
    return [{ m: 2 }];
  }
  if (/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql)) {
    return [];
  }
  throw new Error(`unexpected sql: ${sql}`);
}

const signerKeys = {
  publicKey: "",
  publicPqKey: "",
  publicMldsaKey: "",
};

function sharingDb(activeUserIds: string[]): QueryExecutor & {
  transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T>;
} {
  const executor: QueryExecutor & {
    transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T>;
  } = {
    async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
      return answerQuery(sql, params, activeUserIds) as T[];
    },
    async transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T> {
      return fn(executor);
    },
  };
  return executor;
}

function sharingService(mode: CryptoRolloutMode, activeUserIds: string[]): VaultSharingService {
  return new VaultSharingService({
    db: sharingDb(activeUserIds),
    vaults: {
      findById: async () => ({
        id: VAULT_ID,
        workspaceId: WORKSPACE_ID,
        name: "Vault",
        description: "",
        icon: "",
        isPersonal: false,
        ownerId: ACTOR_ID,
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
      canReadVault: async () => true,
    },
    config: { cryptoRolloutMode: mode },
  });
}

function syncService(mode: CryptoRolloutMode, signer: Signer): SyncService {
  return new SyncService({
    vaults: {
      findById: async () => ({
        id: VAULT_ID,
        workspaceId: WORKSPACE_ID,
        name: "Vault",
        description: "",
        icon: "",
        isPersonal: false,
        ownerId: ACTOR_ID,
        cryptoVersion: 2,
        createdAt: "",
        updatedAt: "",
      }),
      canReadVault: async () => true,
    },
    users: {
      findById: async () => ({
        id: ACTOR_ID,
        email: "actor@okkey.local",
        publicKey: signer.publicKey,
        publicPqKey: signer.publicPqKey,
        publicMldsaKey: signer.publicMldsaKey,
        locale: "en",
        createdAt: "",
        updatedAt: "",
      }),
    },
    events: {
      listAfterVersion: async () => [],
      hasItemCreateEvent: async () => true,
      findByIdempotencyKey: async () => null,
      deleteByVaultAndReferencedItemId: async () => {},
      append: async (input) => ({
        id: "e1",
        vaultId: input.vaultId,
        actorId: input.actorId ?? null,
        eventType: input.eventType,
        encryptedPayload: input.encryptedPayload,
        payloadSchemaVersion: input.payloadSchemaVersion,
        idempotencyKey: input.idempotencyKey ?? null,
        clientCreatedAt: input.clientCreatedAt ?? null,
        referencedItemId: input.referencedItemId ?? null,
        itemSoftDeleted: null,
        version: input.baseVersion + 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    },
    config: { cryptoRolloutMode: mode },
  });
}

async function assertSignatureCode(
  run: () => Promise<unknown>,
  expected: "SIGNATURE_REQUIRED" | "SIGNATURE_INVALID",
  label: string,
): Promise<void> {
  await assert.rejects(
    run,
    (error: unknown) => {
      const code =
        error instanceof SyncServiceError || error instanceof VaultSharingServiceError
          ? error.code
          : "";
      const status =
        error instanceof SyncServiceError || error instanceof VaultSharingServiceError
          ? error.statusCode
          : 0;
      assert.equal(code, expected, label);
      assert.equal(status, 400, label);
      return true;
    },
    label,
  );
}

test("signature requirement is mode- and operation-specific", () => {
  for (const operation of CRITICAL_SIGNATURE_OPERATIONS) {
    assert.equal(
      isSignatureRequired({ rolloutMode: "strict", operation }),
      true,
      operation,
    );
    assert.equal(
      isSignatureRequired({ rolloutMode: "compat", operation }),
      false,
      operation,
    );
  }
  for (const eventType of ["VAULT_SHARE", "VAULT_KEY_ROTATION"] as const) {
    assert.equal(
      isSignatureRequired({ rolloutMode: "strict", operation: "sync.append", eventType }),
      true,
    );
    assert.equal(
      isSignatureRequired({ rolloutMode: "compat", operation: "sync.append", eventType }),
      false,
    );
  }
  for (const eventType of ["ITEM_CREATE", "ITEM_UPDATE", "ITEM_DELETE", "VAULT_CREATE", "DEVICE_ADD"]) {
    assert.equal(
      isSignatureRequired({ rolloutMode: "strict", operation: "sync.append", eventType }),
      false,
      eventType,
    );
  }
  for (const eventType of PERSONAL_WORKSPACE_EVENT_TYPES) {
    assert.equal(
      isSignatureRequired({ rolloutMode: "strict", operation: "sync.append", eventType }),
      false,
      eventType,
    );
  }
});

test("sync append signature gate", async () => {
  const signer = createSigner();
  for (const eventType of ["VAULT_SHARE", "VAULT_KEY_ROTATION"] as const) {
    const encryptedBlob = eventBlob("sync_event", eventType);
    const valid = sign({
      signer,
      context: "sync.append",
      vaultId: VAULT_ID,
      eventType,
      encryptedBlob,
    });
    for (const mode of ["strict", "compat"] as const) {
      const label = `${mode} ${eventType}`;
      const service = () => syncService(mode, signer);
      if (mode === "strict") {
        await assertSignatureCode(
          () =>
            service().appendEvent(VAULT_ID, ACTOR_ID, {
              eventType,
              encryptedBlob,
              baseVersion: 0,
            }),
          "SIGNATURE_REQUIRED",
          `${label} unsigned`,
        );
      } else {
        const accepted = await service().appendEvent(VAULT_ID, ACTOR_ID, {
          eventType,
          encryptedBlob,
          baseVersion: 0,
        });
        assert.equal(accepted.eventType, eventType, `${label} unsigned`);
      }
      await assertSignatureCode(
        () =>
          service().appendEvent(VAULT_ID, ACTOR_ID, {
            eventType,
            encryptedBlob,
            signature: corruptSignature(valid),
            baseVersion: 0,
          }),
        "SIGNATURE_INVALID",
        `${label} bad signature`,
      );
      const stored = await service().appendEvent(VAULT_ID, ACTOR_ID, {
        eventType,
        encryptedBlob,
        signature: valid,
        baseVersion: 0,
      });
      assert.equal(stored.eventType, eventType, `${label} valid`);
    }
  }
});

test("shared vault mutation signature gate", async () => {
  const signer = createSigner();
  signerKeys.publicKey = signer.publicKey;
  signerKeys.publicPqKey = signer.publicPqKey;
  signerKeys.publicMldsaKey = signer.publicMldsaKey;

  const cases: Array<{
    name: "share" | "revoke" | "rotate" | "role";
    context: HybridSignatureEnvelopeV2["context"];
    eventType: "VAULT_SHARE" | "VAULT_KEY_ROTATION";
    activeUserIds: string[];
  }> = [
    {
      name: "share",
      context: "vault.share",
      eventType: "VAULT_SHARE",
      activeUserIds: [ACTOR_ID],
    },
    {
      name: "revoke",
      context: "vault.revoke",
      eventType: "VAULT_KEY_ROTATION",
      activeUserIds: [ACTOR_ID],
    },
    {
      name: "rotate",
      context: "vault.rotate",
      eventType: "VAULT_KEY_ROTATION",
      activeUserIds: [ACTOR_ID],
    },
    {
      name: "role",
      context: "vault.member_role_update",
      eventType: "VAULT_KEY_ROTATION",
      activeUserIds: [ACTOR_ID, RECIPIENT_ID],
    },
  ];

  for (const spec of cases) {
    const encryptedBlob = eventBlob("vault_event_payload", spec.eventType);
    const valid = sign({
      signer,
      context: spec.context,
      vaultId: VAULT_ID,
      eventType: spec.eventType,
      encryptedBlob,
    });
    const rotatedFor = spec.name === "share" ? [] : spec.activeUserIds;
    const run = (mode: CryptoRolloutMode, signature?: HybridSignatureEnvelopeV2) => {
      const service = sharingService(mode, spec.activeUserIds);
      if (spec.name === "share") {
        return service.shareVault(VAULT_ID, ACTOR_ID, {
          recipientUserId: RECIPIENT_ID,
          encryptedVaultKey: wrapBlob(RECIPIENT_ID),
          encryptedPayload: encryptedBlob,
          signature,
          baseVersion: 0,
        });
      }
      if (spec.name === "revoke") {
        return service.revokeVaultAccess(VAULT_ID, ACTOR_ID, {
          recipientUserId: RECIPIENT_ID,
          rotatedVaultKeys: rotatedFor.map((userId) => ({
            userId,
            encryptedVaultKey: wrapBlob(userId),
          })),
          encryptedPayload: encryptedBlob,
          signature,
          baseVersion: 0,
        });
      }
      if (spec.name === "rotate") {
        return service.rotateVaultKey(VAULT_ID, ACTOR_ID, {
          rotatedVaultKeys: rotatedFor.map((userId) => ({
            userId,
            encryptedVaultKey: wrapBlob(userId),
          })),
          encryptedPayload: encryptedBlob,
          signature,
          baseVersion: 0,
          reason: "manual",
        });
      }
      return service.updateVaultMemberRole(VAULT_ID, ACTOR_ID, {
        memberId: RECIPIENT_ID,
        newRole: "member",
        rotatedVaultKeys: rotatedFor.map((userId) => ({
          userId,
          encryptedVaultKey: wrapBlob(userId),
        })),
        encryptedPayload: encryptedBlob,
        signature,
        baseVersion: 0,
      });
    };

    for (const mode of ["strict", "compat"] as const) {
      const label = `${mode} ${spec.name}`;
      if (mode === "strict") {
        await assertSignatureCode(() => run(mode), "SIGNATURE_REQUIRED", `${label} unsigned`);
      } else {
        await run(mode);
      }
      await assertSignatureCode(
        () => run(mode, corruptSignature(valid)),
        "SIGNATURE_INVALID",
        `${label} bad signature`,
      );
      await run(mode, valid);
    }
  }
});
