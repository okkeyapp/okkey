import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiApp } from "../src/app.ts";
import type { ApiConfig } from "../src/config.ts";
import { createTestApiConfig } from "./test-api-config.ts";
import {
  RegistrationError,
  type RegisterCompleteResult,
  type RegistrationService,
} from "../src/registration/service.ts";

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = "";
  private readonly headers = new Map<string, string>();

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

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

const config: ApiConfig = createTestApiConfig();

function validRegisterBody() {
  return {
    auth_state_id: "state-1",
    user_public_key: Buffer.alloc(32, 1).toString("base64"),
    user_public_pq_key: Buffer.alloc(1184, 8).toString("base64"),
    encrypted_private_key: {
      crypto_version: 2,
      algorithm: "opaque",
      payload: Buffer.alloc(2473, 2).toString("base64"),
      meta: {},
    },
    server_key_share: Buffer.alloc(32, 3).toString("base64"),
    password_kdf_salt: Buffer.alloc(16, 4).toString("base64"),
    password_kdf_params_version: 1,
    device_public_key: Buffer.from("dpk").toString("base64"),
    device_share: Buffer.alloc(32, 5).toString("base64"),
    device_fingerprint: "a".repeat(64),
    device_name: "Mac",
    platform: "desktop",
    os_name: "macOS",
    os_version: "14",
    app_version: "1.0.0",
    client_type: "desktop",
    user_agent: "test",
  };
}

function createRegistrationStub(
  impl?: (input: unknown) => Promise<RegisterCompleteResult>,
): RegistrationService {
  return {
    completeRegistration: async (input) => {
      if (impl) {
        return impl(input);
      }
      return {
        userId: "u1",
        workspaceId: "w1",
        vaultId: "v1",
        deviceId: "d1",
        deviceStatus: "trusted",
        accessToken: "tok-reg-1",
        expiresAt: "2099-01-01T00:00:00.000Z",
        tokenType: "Bearer" as const,
      };
    },
  } as unknown as RegistrationService;
}

async function dispatch(input: {
  body?: Record<string, unknown>;
  registrationService?: RegistrationService;
}) {
  const app = createApiApp(config, loggerStub(), {
    registrationService: input.registrationService ?? createRegistrationStub(),
  });
  const handler = app.handler();

  const req = {
    method: "POST",
    url: "/auth/register/complete",
    headers: { "x-forwarded-for": "127.0.0.1" },
    body: input.body ?? validRegisterBody(),
  } as IncomingMessage;
  const res = new MockResponse();

  await handler(req, res as unknown as ServerResponse);
  return res;
}

test("POST /auth/register/complete returns 201", async () => {
  const res = await dispatch({});
  assert.equal(res.statusCode, 201);
  const payload = JSON.parse(res.body) as { user_id: string; device_status: string };
  assert.equal(payload.user_id, "u1");
  assert.equal(payload.device_status, "trusted");
});

test("POST /auth/register/complete validates auth_state_id", async () => {
  const body = validRegisterBody();
  delete (body as { auth_state_id?: string }).auth_state_id;
  const res = await dispatch({ body });
  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "REGISTRATION_BAD_REQUEST");
});

test("POST /auth/register/complete rejects invalid personal_workspace_name", async () => {
  const body = validRegisterBody();
  body.personal_workspace_name = `${"x".repeat(129)}`;
  const res = await dispatch({ body });
  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "REGISTRATION_BAD_REQUEST");
});

test("POST /auth/register/complete maps RegistrationError", async () => {
  const res = await dispatch({
    registrationService: createRegistrationStub(async () => {
      throw new RegistrationError("AUTH_CHALLENGE_EXPIRED", 410, "gone");
    }),
  });
  assert.equal(res.statusCode, 410);
  const payload = JSON.parse(res.body) as { error: string };
  assert.equal(payload.error, "AUTH_CHALLENGE_EXPIRED");
});

const REGISTER_SUCCESS_KEYS = new Set([
  "user_id",
  "workspace_id",
  "vault_id",
  "device_id",
  "device_status",
  "access_token",
  "expires_at",
  "token_type",
]);

test("POST /auth/register/complete success exposes only public ids (no ciphertext shares)", async () => {
  const res = await dispatch({});
  assert.equal(res.statusCode, 201);
  const raw = res.body.toLowerCase();
  assert.ok(!raw.includes("server_key_share"));
  assert.ok(!raw.includes("encrypted_private"));
  assert.ok(!raw.includes("password_kdf_salt"));
  assert.ok(!raw.includes("device_share"));
  const payload = JSON.parse(res.body) as Record<string, unknown>;
  const keys = Object.keys(payload);
  assert.equal(keys.length, REGISTER_SUCCESS_KEYS.size);
  for (const k of keys) {
    assert.ok(REGISTER_SUCCESS_KEYS.has(k), `unexpected key in response: ${k}`);
  }
});

test("request logger does not include registration body fields", async () => {
  const logExtras: Array<Record<string, unknown> | undefined> = [];
  const logger = {
    info(_message: string, extra?: Record<string, unknown>) {
      logExtras.push(extra);
    },
    warn(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, extra?: Record<string, unknown>) {
      logExtras.push(extra);
    },
  };
  const body = validRegisterBody();
  const marker = "REQ_BODY_LEAK_MARKER_9f2a";
  body.device_name = marker;

  const app = createApiApp(config, logger, {
    registrationService: createRegistrationStub(),
  });
  const handler = app.handler();
  const req = {
    method: "POST",
    url: "/auth/register/complete",
    headers: { "x-forwarded-for": "127.0.0.1" },
    body,
  } as IncomingMessage;
  const res = new MockResponse();
  await handler(req, res as unknown as ServerResponse);

  const combined = JSON.stringify(logExtras);
  assert.ok(
    !combined.includes(marker),
    "logger must not echo JSON body (e.g. device_name)",
  );
  assert.equal(res.statusCode, 201);
});
