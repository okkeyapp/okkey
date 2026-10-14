import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import {
  createAccountVaultUnlockRoute,
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

async function dispatch(input: {
  userId: string | null;
  body: unknown;
  records: { count: number };
}): Promise<number> {
  const handler = createAccountVaultUnlockRoute(
    {
      recordVaultUnlock: async () => {
        input.records.count += 1;
        return true;
      },
    },
    async () => input.userId,
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
  return res.statusCode;
}

test("POST /account/vault-unlock requires authentication", async () => {
  resetVaultUnlockAttemptLimiterForTests();
  const records = { count: 0 };
  const status = await dispatch({ userId: null, body: {}, records });
  assert.equal(status, 401);
  assert.equal(records.count, 0);
});

test("POST /account/vault-unlock does not record a wrong password and limits attempts", async () => {
  resetVaultUnlockAttemptLimiterForTests();
  const records = { count: 0 };
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    statuses.push(
      await dispatch({
        userId: "42",
        body: { password: "wrong-master-password" },
        records,
      }),
    );
  }
  assert.equal(records.count, 0, "a wrong master password must not be recorded as an unlock");
  assert.ok(
    statuses.some((status) => status === 429),
    "repeated vault unlock attempts must be limited",
  );
});

test("POST /account/vault-unlock records an empty successful stamp", async () => {
  resetVaultUnlockAttemptLimiterForTests();
  const records = { count: 0 };
  const status = await dispatch({ userId: "42", body: {}, records });
  assert.equal(status, 200);
  assert.equal(records.count, 1);
});
