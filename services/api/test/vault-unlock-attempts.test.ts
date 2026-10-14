import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import { createMemoryVaultUnlockAttemptStore } from "../src/account/vault-unlock-attempts.ts";
import {
  createAccountVaultUnlockRoute,
  createAccountVaultUnlockStatusRoute,
  resetVaultUnlockAttemptLimiterForTests,
} from "../src/routes/account-vault-unlock.ts";

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = "";

  setHeader(_name: string, _value: string): void {}

  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
    this.writableEnded = true;
  }
}

async function dispatchPost(input: {
  userId: string | null;
  body: unknown;
  records: { count: number };
  store?: ReturnType<typeof createMemoryVaultUnlockAttemptStore>;
  verifyAttestation?: (input: {
    userId: string;
    publicKeyBase64: string;
    attestation: { userId: string; recordedAt: string; signature: string };
    now: number;
  }) => boolean;
}): Promise<{ status: number; body: string }> {
  const store = input.store ?? createMemoryVaultUnlockAttemptStore();
  const handler = createAccountVaultUnlockRoute(
    {
      recordVaultUnlock: async () => {
        input.records.count += 1;
        return true;
      },
      findById: async (id: string) => (id ? { publicKey: "dGVzdC1wdWJsaWMta2V5" } : null),
    },
    async () => input.userId,
    {
      attemptStore: store,
      verifyAttestation: input.verifyAttestation,
    },
  );
  const req = {
    method: "POST",
    url: "/account/vault-unlock",
    body: input.body,
  } as IncomingMessage;
  const res = new MockResponse();
  await handler({
    req,
    res: res as unknown as ServerResponse,
    params: {},
    requestId: "req-1",
  });
  return { status: res.statusCode, body: res.body };
}

async function dispatchStatus(input: {
  userId: string | null;
  store: ReturnType<typeof createMemoryVaultUnlockAttemptStore>;
}): Promise<{ status: number; body: string }> {
  const handler = createAccountVaultUnlockStatusRoute(async () => input.userId, {
    attemptStore: input.store,
  });
  const req = {
    method: "GET",
    url: "/account/vault-unlock/status",
  } as IncomingMessage;
  const res = new MockResponse();
  await handler({
    req,
    res: res as unknown as ServerResponse,
    params: {},
    requestId: "req-status",
  });
  return { status: res.statusCode, body: res.body };
}

test("POST /account/vault-unlock requires authentication", async () => {
  resetVaultUnlockAttemptLimiterForTests();
  const records = { count: 0 };
  const result = await dispatchPost({ userId: null, body: {}, records });
  assert.equal(result.status, 401);
  assert.equal(records.count, 0);
});

test("POST /account/vault-unlock does not record a wrong password and limits attempts", async () => {
  resetVaultUnlockAttemptLimiterForTests();
  const store = createMemoryVaultUnlockAttemptStore();
  const records = { count: 0 };
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = await dispatchPost({
      userId: "42",
      body: { password: "wrong-master-password" },
      records,
      store,
    });
    statuses.push(result.status);
  }
  assert.equal(records.count, 0, "a wrong master password must not be recorded as an unlock");
  assert.ok(
    statuses.some((status) => status === 429),
    "repeated vault unlock attempts must be limited",
  );
});

test("POST /account/vault-unlock rejects an empty body without recording", async () => {
  resetVaultUnlockAttemptLimiterForTests();
  const store = createMemoryVaultUnlockAttemptStore();
  const records = { count: 0 };
  const result = await dispatchPost({ userId: "42", body: {}, records, store });
  assert.equal(result.status, 400);
  assert.equal(records.count, 0);
});

test("POST /account/vault-unlock records a valid attestation and clears lockout", async () => {
  resetVaultUnlockAttemptLimiterForTests();
  const store = createMemoryVaultUnlockAttemptStore();
  const records = { count: 0 };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await dispatchPost({
      userId: "42",
      body: { failure: true },
      records,
      store,
    });
  }
  const locked = await dispatchPost({
    userId: "42",
    body: { failure: true },
    records,
    store,
  });
  assert.equal(locked.status, 429);

  const recorded = await dispatchPost({
    userId: "42",
    body: {
      attestation: {
        purpose: "account.vault_unlock",
        user_id: "42",
        recorded_at: new Date().toISOString(),
        signature: "dGVzdC1zaWc=",
      },
    },
    records,
    store,
    verifyAttestation: () => true,
  });
  assert.equal(recorded.status, 200);
  assert.equal(records.count, 1);

  const status = await dispatchStatus({ userId: "42", store });
  assert.equal(status.status, 200);
  const payload = JSON.parse(status.body) as { locked: boolean; remaining_ms: number };
  assert.equal(payload.locked, false);
  assert.equal(payload.remaining_ms, 0);
});
