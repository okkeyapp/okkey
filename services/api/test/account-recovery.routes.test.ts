import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";

import { AccountRecoveryService } from "../src/account-recovery/service.ts";
import { createApiApp } from "../src/app.ts";
import type { AccountRecoveryRepository } from "../src/storage/account-recovery.ts";
import type { SessionService } from "../src/session/service.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const USER_ID = "user-1";
const SERVER_SHARE_SENTINEL = "SERVER-SHARE-SECRET-MUST-NOT-LEAK";

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = "";
  setHeader(): void {}
  end(chunk?: string): void {
    if (chunk) this.body += chunk;
    this.writableEnded = true;
  }
}

function loggerStub() {
  return {
    info(_message: string, _extra?: Record<string, unknown>) {},
    warn(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, _extra?: Record<string, unknown>) {},
  };
}

function sessionStub(): SessionService {
  return {
    async resolveAccessToken(token: string) {
      return token === "good-token" ? { userId: USER_ID } : null;
    },
  } as unknown as SessionService;
}

function recoveryBlob(payload: string) {
  return {
    crypto_version: 2,
    algorithm: "opaque",
    payload,
    meta: { entity: "vault_key_recovery_wrap" },
  };
}

function createRecoveryService(planTier: string) {
  let wrap: {
    userId: string;
    encryptedBlob: ReturnType<typeof recoveryBlob>;
    createdAt: string;
    rotatedAt: string | null;
    exportedAt: string | null;
  } | null = null;
  let settings: {
    userId: string;
    keyEnabled: boolean;
    devicesEnabled: boolean;
    contactsEnabled: boolean;
    updatedAt: string;
  } | null = null;

  const recovery = {
    async getWrap(userId: string) {
      return wrap?.userId === userId ? wrap : null;
    },
    async upsertWrap(userId: string, encryptedBlob: ReturnType<typeof recoveryBlob>, rotated: boolean) {
      wrap = {
        userId,
        encryptedBlob,
        createdAt: wrap?.createdAt ?? "2026-01-01T00:00:00.000Z",
        rotatedAt: rotated ? "2026-01-02T00:00:00.000Z" : wrap?.rotatedAt ?? null,
        exportedAt: null,
      };
      return wrap;
    },
    async markExported(userId: string) {
      if (!wrap || wrap.userId !== userId) return null;
      wrap = { ...wrap, exportedAt: "2026-01-03T00:00:00.000Z" };
      return wrap;
    },
    async deleteWrap() {
      wrap = null;
    },
    async getSettings(userId: string) {
      return settings?.userId === userId ? settings : null;
    },
    async upsertSettings(
      userId: string,
      input: { keyEnabled: boolean; devicesEnabled: boolean; contactsEnabled: boolean },
    ) {
      settings = { userId, ...input, updatedAt: "2026-01-01T00:00:00.000Z" };
      return settings;
    },
    async listContacts() {
      return [];
    },
    async countConfirmedContacts() {
      return 0;
    },
    async findContactByEmail() {
      return null;
    },
    async insertContact() {
      throw new Error("not used");
    },
    async deleteContact() {
      return false;
    },
    async listPendingInvitesForContact() {
      return [];
    },
    async confirmInvite() {
      return null;
    },
    async rejectInvite() {
      return false;
    },
    async listMembershipsForContact() {
      return [];
    },
    async deleteMembershipAsContact() {
      return null;
    },
  } as AccountRecoveryRepository;

  const service = new AccountRecoveryService({
    recovery,
    workspaces: {
      async listAccessibleByUser() {
        return [
          {
            id: "w1",
            planTier,
            planCustomOverride: false,
            planFeatureOverrides: {},
          },
        ] as never;
      },
    },
    users: {
      async findById(id: string) {
        return id === USER_ID
          ? { id, email: "owner@example.com", locale: "en" }
          : null;
      },
      async findByEmail() {
        return null;
      },
      async loadAccountProfile() {
        return {
          email: "owner@example.com",
          firstName: "Owner",
          lastName: null,
          locale: "en",
        };
      },
      async loadVaultUnlockRow() {
        return {
          encryptedPrivateKey: Uint8Array.from(
            Buffer.from(
              JSON.stringify({
                crypto_version: 2,
                algorithm: "opaque",
                payload: Buffer.from("identity-cipher").toString("base64"),
                meta: { entity: "identity_private_key" },
              }),
            ),
          ),
          serverKeyShare: Uint8Array.from(Buffer.from(SERVER_SHARE_SENTINEL)),
          passwordKdfSalt: Uint8Array.from([1]),
        };
      },
    } as never,
    publicAppBaseUrl: "https://app.okkey.test",
  });

  return { service, readWrap: () => wrap };
}

function appFor(service: AccountRecoveryService) {
  return createApiApp(
    createTestApiConfig({ allowHeaderUserIdAuth: false }),
    loggerStub(),
    { accountRecoveryService: service, sessionService: sessionStub() },
  );
}

async function dispatch(
  service: AccountRecoveryService,
  input: { method: string; url: string; body?: unknown; auth?: boolean },
) {
  const req = {
    method: input.method,
    url: input.url,
    headers: input.auth ? { authorization: "Bearer good-token" } : {},
    body: input.body,
  } as IncomingMessage;
  const res = new MockResponse();
  await appFor(service).handler()(req, res as unknown as ServerResponse);
  return res;
}

function jsonBody(res: MockResponse): Record<string, unknown> {
  return JSON.parse(res.body) as Record<string, unknown>;
}

const AUTHED_ROUTES: Array<{ method: string; url: string; body?: unknown }> = [
  { method: "GET", url: "/account/recovery" },
  { method: "PATCH", url: "/account/recovery/settings", body: { keyEnabled: true } },
  { method: "POST", url: "/account/recovery/key/enroll", body: { encryptedBlob: recoveryBlob("YQ==") } },
  { method: "POST", url: "/account/recovery/key/ack-export" },
  { method: "POST", url: "/account/recovery/key/rotate", body: { encryptedBlob: recoveryBlob("YQ==") } },
  { method: "GET", url: "/account/recovery/key/wrap" },
  { method: "GET", url: "/account/recovery/identity-encrypted-key" },
  { method: "POST", url: "/account/recovery/contacts", body: { email: "friend@example.com" } },
  { method: "DELETE", url: "/account/recovery/contacts/contact-1" },
  { method: "POST", url: "/account/recovery/contacts/invites/invite-1/accept" },
  { method: "POST", url: "/account/recovery/contacts/invites/invite-1/reject" },
  { method: "DELETE", url: "/account/recovery/contacts/memberships/contact-1" },
];

test("account recovery routes require auth (QA web 12.4)", async () => {
  const { service } = createRecoveryService("FREE");
  for (const route of AUTHED_ROUTES) {
    const res = await dispatch(service, route);
    assert.equal(res.statusCode, 401, `${route.method} ${route.url}`);
    assert.equal(jsonBody(res).error, "AUTH_REQUIRED");
  }
});

test("recovery key cannot be disabled and FREE cannot enable paid methods (QA web 3.3, 4.11)", async () => {
  const { service } = createRecoveryService("FREE");
  const disable = await dispatch(service, {
    method: "PATCH",
    url: "/account/recovery/settings",
    auth: true,
    body: { keyEnabled: false },
  });
  assert.equal(disable.statusCode, 403);
  assert.equal(jsonBody(disable).error, "RECOVERY_KEY_REQUIRED");

  const devices = await dispatch(service, {
    method: "PATCH",
    url: "/account/recovery/settings",
    auth: true,
    body: { devicesEnabled: true },
  });
  assert.equal(devices.statusCode, 403);
  assert.equal(jsonBody(devices).error, "RECOVERY_ENTITLEMENT_REQUIRED");

  const contacts = await dispatch(service, {
    method: "PATCH",
    url: "/account/recovery/settings",
    auth: true,
    body: { contactsEnabled: true },
  });
  assert.equal(contacts.statusCode, 403);
  assert.equal(jsonBody(contacts).error, "RECOVERY_ENTITLEMENT_REQUIRED");
});

test("paid plan still rejects contacts until 3 are confirmed (QA web 3.3, 2.9)", async () => {
  const { service } = createRecoveryService("PREMIUM");
  const contacts = await dispatch(service, {
    method: "PATCH",
    url: "/account/recovery/settings",
    auth: true,
    body: { contactsEnabled: true },
  });
  assert.equal(contacts.statusCode, 400);
  assert.equal(jsonBody(contacts).error, "RECOVERY_CONTACTS_INSUFFICIENT");
});

test(
  "trusted-devices recovery requires at least 2 trusted devices including the current one (QA web 3.3)",
  { todo: true },
  async () => {
    const { service } = createRecoveryService("PREMIUM");
    const devices = await dispatch(service, {
      method: "PATCH",
      url: "/account/recovery/settings",
      auth: true,
      body: { devicesEnabled: true },
    });
    assert.ok(devices.statusCode >= 400 && devices.statusCode < 500);
  },
);

test("validation errors are 4xx (QA web 12.4)", async () => {
  const { service } = createRecoveryService("PREMIUM");
  const badJson = await dispatch(service, {
    method: "PATCH",
    url: "/account/recovery/settings",
    auth: true,
    body: "{",
  });
  assert.equal(badJson.statusCode, 400);
  assert.equal(jsonBody(badJson).error, "RECOVERY_BAD_REQUEST");

  const missing = await dispatch(service, {
    method: "POST",
    url: "/account/recovery/key/enroll",
    auth: true,
    body: {},
  });
  assert.equal(missing.statusCode, 400);

  const badEntity = await dispatch(service, {
    method: "POST",
    url: "/account/recovery/key/enroll",
    auth: true,
    body: {
      encryptedBlob: { ...recoveryBlob("YQ=="), meta: { entity: "something_else" } },
    },
  });
  assert.equal(badEntity.statusCode, 400);
  assert.notEqual(badEntity.statusCode, 500);

  const badEmail = await dispatch(service, {
    method: "POST",
    url: "/account/recovery/contacts",
    auth: true,
    body: { email: "not-an-email" },
  });
  assert.ok(badEmail.statusCode >= 400 && badEmail.statusCode < 500);
});

test("ack-export marks the key exported and does not return the plaintext again (QA web 3.4, 3.5)", async () => {
  const { service } = createRecoveryService("FREE");
  const plaintext = "RECOVERY-SECRET-PLAINTEXT";
  const enrolled = await dispatch(service, {
    method: "POST",
    url: "/account/recovery/key/enroll",
    auth: true,
    body: { encryptedBlob: recoveryBlob(Buffer.from("cipher-a").toString("base64")) },
  });
  assert.equal(enrolled.statusCode, 200);
  assert.equal(enrolled.body.includes(plaintext), false);

  const acked = await dispatch(service, {
    method: "POST",
    url: "/account/recovery/key/ack-export",
    auth: true,
  });
  assert.equal(acked.statusCode, 200);
  const ackedBody = jsonBody(acked) as { key?: { exportedAt?: string | null } };
  assert.equal(typeof ackedBody.key?.exportedAt, "string");
  assert.equal(acked.body.includes(plaintext), false);

  const wrap = await dispatch(service, {
    method: "GET",
    url: "/account/recovery/key/wrap",
    auth: true,
  });
  assert.equal(wrap.statusCode, 200);
  assert.equal(wrap.body.includes(plaintext), false);
  const wrapBody = jsonBody(wrap) as { encryptedBlob?: { payload?: string } };
  assert.equal(wrapBody.encryptedBlob?.payload, Buffer.from("cipher-a").toString("base64"));
  assert.equal(JSON.stringify(wrapBody).includes("recoverySecret"), false);
});

test("rotate replaces the wrap blob (QA web 3.6)", async () => {
  const { service, readWrap } = createRecoveryService("FREE");
  const firstPayload = Buffer.from("cipher-old").toString("base64");
  const nextPayload = Buffer.from("cipher-new").toString("base64");
  assert.equal(
    (
      await dispatch(service, {
        method: "POST",
        url: "/account/recovery/key/enroll",
        auth: true,
        body: { encryptedBlob: recoveryBlob(firstPayload) },
      })
    ).statusCode,
    200,
  );
  const rotated = await dispatch(service, {
    method: "POST",
    url: "/account/recovery/key/rotate",
    auth: true,
    body: { encryptedBlob: recoveryBlob(nextPayload) },
  });
  assert.equal(rotated.statusCode, 200);
  assert.equal(readWrap()?.encryptedBlob.payload, nextPayload);
  const wrap = jsonBody(
    await dispatch(service, { method: "GET", url: "/account/recovery/key/wrap", auth: true }),
  ) as { encryptedBlob?: { payload?: string } };
  assert.equal(wrap.encryptedBlob?.payload, nextPayload);
  assert.notEqual(wrap.encryptedBlob?.payload, firstPayload);
});

test("identity-encrypted-key returns only ciphertext (QA web 3.7)", async () => {
  const { service } = createRecoveryService("FREE");
  const res = await dispatch(service, {
    method: "GET",
    url: "/account/recovery/identity-encrypted-key",
    auth: true,
  });
  assert.equal(res.statusCode, 200);
  const body = jsonBody(res);
  assert.ok(body.encrypted_private_key);
  assert.equal(res.body.includes(SERVER_SHARE_SENTINEL), false);
  assert.equal("server_key_share" in body, false);
  assert.equal("serverKeyShare" in body, false);
  const keys = Object.keys(body).sort();
  assert.deepEqual(keys, ["encrypted_private_key"]);
});
