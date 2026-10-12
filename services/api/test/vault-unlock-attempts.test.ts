import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import { createApiApp } from "../src/app.ts";
import type { SessionService } from "../src/session/service.ts";
import type { UsersRepository } from "../src/storage/repositories.ts";
import { createTestApiConfig } from "./test-api-config.ts";

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

function loggerStub() {
  return {
    info(_message: string, _extra?: Record<string, unknown>) {},
    warn(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, _extra?: Record<string, unknown>) {},
  };
}

function appWithUnlockRecorder(): {
  handler: ReturnType<ReturnType<typeof createApiApp>["handler"]>;
  records: { count: number };
} {
  const records = { count: 0 };
  const app = createApiApp(createTestApiConfig({ allowHeaderUserIdAuth: true }), loggerStub(), {
    sessionService: { resolveAccessToken: async () => null } as unknown as SessionService,
    usersRepository: {
      recordVaultUnlock: async () => {
        records.count += 1;
        return true;
      },
      updateMasterPasswordShares: async () => null,
    } as unknown as UsersRepository,
  });
  return { handler: app.handler(), records };
}

async function dispatch(
  handler: ReturnType<ReturnType<typeof createApiApp>["handler"]>,
  headers: Record<string, string>,
  body: unknown,
): Promise<number> {
  const req = {
    method: "POST",
    url: "/account/vault-unlock",
    headers,
    body,
  } as IncomingMessage;
  const res = new MockResponse();
  await handler(req, res as unknown as ServerResponse);
  return res.statusCode;
}

test("POST /account/vault-unlock requires authentication", async () => {
  const { handler, records } = appWithUnlockRecorder();
  const status = await dispatch(handler, {}, {});
  assert.equal(status, 401);
  assert.equal(records.count, 0);
});

test("POST /account/vault-unlock does not record a wrong password and limits attempts", async () => {
  const { handler, records } = appWithUnlockRecorder();
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    statuses.push(
      await dispatch(handler, { "x-user-id": "42" }, { password: "wrong-master-password" }),
    );
  }
  assert.equal(records.count, 0, "a wrong master password must not be recorded as an unlock");
  assert.ok(
    statuses.some((status) => status === 429),
    "repeated vault unlock attempts must be limited",
  );
});
