import assert from "node:assert/strict";
import test from "node:test";
import { CapsuleService, CapsuleServiceError } from "../src/capsule/service.ts";
import { createTestApiConfig } from "./test-api-config.ts";

test("createCapsule rejects disallowed crypto profile", async () => {
  const service = new CapsuleService({
    db: {
      transaction: async () => {
        throw new Error("db should not be called");
      },
      query: async () => {
        throw new Error("db should not be called");
      },
    },
    redis: {
      incr: async () => 1,
      expire: async () => true,
    },
    objectStorage: {
      putObject: async () => {},
      getObject: async () => null,
    },
    config: createTestApiConfig({
      allowedCryptoProfileVersions: [2],
    }),
  });

  await assert.rejects(
    () =>
      service.createCapsule("w1", "u1", {
        type: "item",
        encryptedPayload: {
          crypto_version: 1,
          algorithm: "opaque",
          payload: Buffer.from("cipher").toString("base64"),
          meta: {},
        },
      }),
    (err: unknown) =>
      err instanceof CapsuleServiceError && err.code === "CRYPTO_PROFILE_NOT_ALLOWED",
  );
});

test("createCapsule rejects unsafe key transport mode", async () => {
  const service = new CapsuleService({
    db: {
      transaction: async () => {
        throw new Error("db should not be called");
      },
      query: async () => {
        throw new Error("db should not be called");
      },
    },
    redis: {
      incr: async () => 1,
      expire: async () => true,
    },
    objectStorage: {
      putObject: async () => {},
      getObject: async () => null,
    },
    config: createTestApiConfig({
      allowedCryptoProfileVersions: [2],
    }),
  });

  await assert.rejects(
    () =>
      service.createCapsule("w1", "u1", {
        type: "item",
        keyTransportMode: "query",
        encryptedPayload: {
          crypto_version: 2,
          algorithm: "opaque",
          payload: Buffer.from("cipher").toString("base64"),
          meta: {},
        },
      }),
    (err: unknown) =>
      err instanceof CapsuleServiceError && err.code === "CAPSULE_UNSAFE_KEY_TRANSPORT",
  );
});

test("openCapsule rejects unsafe key transport mode before storage access", async () => {
  const service = new CapsuleService({
    db: {
      transaction: async () => {
        throw new Error("db should not be called");
      },
      query: async () => {
        throw new Error("db should not be called");
      },
    },
    redis: {
      incr: async () => 1,
      expire: async () => true,
    },
    objectStorage: {
      putObject: async () => {},
      getObject: async () => null,
    },
    config: createTestApiConfig(),
  });

  await assert.rejects(
    () =>
      service.openCapsule(
        "00000000-0000-0000-0000-000000000001",
        "127.0.0.1",
        undefined,
        undefined,
        "path",
      ),
    (err: unknown) =>
      err instanceof CapsuleServiceError && err.code === "CAPSULE_UNSAFE_KEY_TRANSPORT",
  );
});
