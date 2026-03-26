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
        encryptedPayload: Buffer.from("cipher").toString("base64"),
        payloadSchemaVersion: 1,
      }),
    (err: unknown) =>
      err instanceof CapsuleServiceError && err.code === "CRYPTO_PROFILE_NOT_ALLOWED",
  );
});
