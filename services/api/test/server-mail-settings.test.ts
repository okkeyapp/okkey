import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";

import { deriveAes256KeyFromSessionSecret, deriveSmtpPasswordKey, openSecret, sealSecret } from "../src/crypto/server-aes.ts";
import { wipeSecretBytes } from "../src/crypto/secret-lifecycle.ts";
import { RuntimeEmailSender, type EmailMessage } from "../src/email/service.ts";
import { registerServerMailSettingsRoutes } from "../src/mail-settings/routes.ts";
import { MailSettingsService } from "../src/mail-settings/service.ts";
import type { MailDeliverySnapshot, ServerMailSettingsRow, ServerMailSettingsStore } from "../src/mail-settings/types.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const WORKSPACE_ID = "1000000000000000100";
const OWNER_ID = "1000000000000000001";
const ADMIN_ID = "1000000000000000002";
const MEMBER_ID = "1000000000000000003";

class MemoryMailStore implements ServerMailSettingsStore {
  row: ServerMailSettingsRow | null = null;
  updatedBy: string | null = null;

  async read(): Promise<ServerMailSettingsRow | null> {
    if (!this.row) {
      return null;
    }
    return {
      ...this.row,
      smtpPasswordCiphertext: this.row.smtpPasswordCiphertext
        ? Buffer.from(this.row.smtpPasswordCiphertext)
        : null,
    };
  }

  async write(row: ServerMailSettingsRow, updatedBy: string): Promise<void> {
    this.updatedBy = updatedBy;
    this.row = {
      ...row,
      smtpPasswordCiphertext: row.smtpPasswordCiphertext
        ? Buffer.from(row.smtpPasswordCiphertext)
        : null,
    };
  }
}

class MockResponse {
  statusCode = 200;
  writableEnded = false;
  body = "";

  setHeader(): void {}

  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
    this.writableEnded = true;
  }
}

function mailConfig(overrides: Partial<ReturnType<typeof createTestApiConfig>> = {}) {
  return createTestApiConfig({
    deploymentMode: "self_hosted",
    emailProvider: "logger",
    publicAppBaseUrl: "https://env.example",
    emailFrom: "env@example.com",
    smtpHost: "smtp.env.example",
    smtpPort: 2525,
    smtpSecure: false,
    smtpUser: "env-user",
    smtpPassword: "env-secret",
    ...overrides,
  });
}

function sealWithSessionSecret(sessionSecret: string, password: string): Buffer {
  const key = deriveSmtpPasswordKey(sessionSecret);
  try {
    return sealSecret(key, Buffer.from(password, "utf8"));
  } finally {
    wipeSecretBytes(key);
  }
}

function unreadableRow(): ServerMailSettingsRow {
  return {
    smtpHost: "smtp.db.example",
    smtpPort: 587,
    smtpTlsMode: "starttls",
    smtpUsername: "db-user",
    smtpPasswordCiphertext: sealWithSessionSecret("rotated-away-session-secret-32chars", "db-secret"),
    emailFrom: "db@example.com",
    publicAppUrl: "https://vault.customer.example",
  };
}

function createService(
  store = new MemoryMailStore(),
  options?: {
    config?: ReturnType<typeof mailConfig>;
    logger?: {
      info: (message: string, extra?: Record<string, unknown>) => void;
      warn: (message: string, extra?: Record<string, unknown>) => void;
      error: (message: string, extra?: Record<string, unknown>) => void;
    };
    sentSnapshots?: MailDeliverySnapshot[];
  },
) {
  const sent: EmailMessage[] = [];
  const service = new MailSettingsService({
    store,
    config: options?.config ?? mailConfig(),
    users: {
      findById: async (id) => (id === OWNER_ID ? { email: "owner@example.com" } : null),
    },
    workspaces: {
      findById: async (id) => (id === WORKSPACE_ID ? { ownerId: OWNER_ID } : null),
      hasAccess: async (id, userId) =>
        id === WORKSPACE_ID && (userId === OWNER_ID || userId === ADMIN_ID || userId === MEMBER_ID),
    },
    logger: options?.logger,
    sendSmtp: async (snapshot, message) => {
      options?.sentSnapshots?.push(snapshot);
      sent.push(message);
    },
  });
  return { service, store, sent };
}

test("smtp password key is distinct from the 2FA key", () => {
  const secret = "test-session-secret-key-min-32-chars";
  const totp = deriveAes256KeyFromSessionSecret(secret);
  const smtp = deriveSmtpPasswordKey(secret);
  assert.equal(smtp.length, 32);
  assert.notEqual(Buffer.compare(totp, smtp), 0);
  assert.equal(Buffer.compare(deriveSmtpPasswordKey(secret), smtp), 0);
});

test("owner reads env fallback when the database row is empty and the password is not returned", async () => {
  const { service } = createService();
  const settings = await service.getForOwner(WORKSPACE_ID, OWNER_ID);
  assert.equal(settings.smtpHost, "smtp.env.example");
  assert.equal(settings.smtpPort, 2525);
  assert.equal(settings.smtpTlsMode, "starttls");
  assert.equal(settings.smtpUsername, "env-user");
  assert.equal(settings.emailFrom, "env@example.com");
  assert.equal(settings.publicAppUrl, "https://env.example");
  assert.equal(settings.passwordSet, true);
  assert.equal(settings.passwordUnreadable, false);
  assert.equal("smtpPassword" in settings, false);
  assert.equal(JSON.stringify(settings).includes("env-secret"), false);
});

test("owner updates settings, empty password keeps the stored ciphertext, and clear falls back to env", async () => {
  const { service, store } = createService();
  const updated = await service.updateForOwner(WORKSPACE_ID, OWNER_ID, {
    smtpHost: "smtp.db.example",
    smtpPort: 587,
    smtpTlsMode: "starttls",
    smtpUsername: "db-user",
    emailFrom: "db@example.com",
    publicAppUrl: "https://vault.customer.example/",
    password: "db-secret",
  });
  assert.equal(updated.smtpHost, "smtp.db.example");
  assert.equal(updated.publicAppUrl, "https://vault.customer.example");
  assert.equal(updated.passwordSet, true);
  assert.equal(JSON.stringify(updated).includes("db-secret"), false);

  const stored = store.row?.smtpPasswordCiphertext;
  assert.ok(stored);
  assert.equal(stored.toString("utf8").includes("db-secret"), false);
  const opened = openSecret(deriveSmtpPasswordKey(mailConfig().sessionSecret), stored);
  assert.equal(opened.toString("utf8"), "db-secret");

  const kept = await service.updateForOwner(WORKSPACE_ID, OWNER_ID, {
    smtpHost: "smtp.db-2.example",
    password: "",
  });
  assert.equal(kept.smtpHost, "smtp.db-2.example");
  assert.equal(kept.passwordSet, true);
  assert.ok(store.row?.smtpPasswordCiphertext);
  assert.equal(
    openSecret(deriveSmtpPasswordKey(mailConfig().sessionSecret), store.row.smtpPasswordCiphertext).toString("utf8"),
    "db-secret",
  );

  const cleared = await service.updateForOwner(WORKSPACE_ID, OWNER_ID, { clearPassword: true });
  assert.equal(store.row?.smtpPasswordCiphertext, null);
  assert.equal(cleared.passwordSet, true);
  const effective = await service.effective();
  assert.equal(effective.smtpPassword, "env-secret");
  assert.equal(effective.publicAppBaseUrl, "https://vault.customer.example");
  assert.equal(effective.useSmtpTransport, true);
});

test("admin and member cannot read or update server mail settings", async () => {
  const { service } = createService();
  for (const userId of [ADMIN_ID, MEMBER_ID]) {
    await assert.rejects(
      () => service.getForOwner(WORKSPACE_ID, userId),
      (error: unknown) => {
        assert.equal((error as { statusCode?: number }).statusCode, 403);
        return true;
      },
    );
    await assert.rejects(
      () => service.updateForOwner(WORKSPACE_ID, userId, { smtpHost: "evil.example" }),
      (error: unknown) => {
        assert.equal((error as { statusCode?: number }).statusCode, 403);
        return true;
      },
    );
  }
});

test("public app URL and port are validated", async () => {
  const { service } = createService();
  await assert.rejects(
    () => service.updateForOwner(WORKSPACE_ID, OWNER_ID, { publicAppUrl: "javascript:alert(1)" }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "INVALID_PUBLIC_APP_URL");
      return true;
    },
  );
  await assert.rejects(
    () => service.updateForOwner(WORKSPACE_ID, OWNER_ID, { smtpPort: 0 }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "INVALID_SMTP_PORT");
      return true;
    },
  );
  const saved = await service.updateForOwner(WORKSPACE_ID, OWNER_ID, {
    publicAppUrl: "https://ok.example/app",
  });
  assert.equal(saved.publicAppUrl, "https://ok.example/app");
});

test("routes: owner can read and update, non-owners get 403, saas is 404, password stays out of JSON", async () => {
  const { service, store } = createService();
  const handlers = new Map<string, (ctx: {
    requestId: string;
    req: IncomingMessage;
    res: MockResponse;
    params: Record<string, string>;
  }) => Promise<void>>();
  registerServerMailSettingsRoutes(
    (method, path, handler) => {
      handlers.set(`${method} ${path}`, handler as never);
    },
    mailConfig(),
    service,
    async (req) => {
      const header = req.headers["x-user-id"];
      return typeof header === "string" ? header : null;
    },
  );

  async function call(method: string, path: string, userId: string | null, body?: unknown) {
    const handler = handlers.get(`${method} ${path}`);
    assert.ok(handler);
    const req = {
      method,
      headers: userId ? { "x-user-id": userId } : {},
      body,
    } as IncomingMessage;
    const res = new MockResponse();
    await handler({
      requestId: "req_test",
      req,
      res: res as unknown as ServerResponse,
      params: { workspaceId: WORKSPACE_ID },
    });
    return res;
  }

  const read = await call("GET", "/workspaces/:workspaceId/server-mail-settings", OWNER_ID);
  assert.equal(read.statusCode, 200);
  const readBody = JSON.parse(read.body) as Record<string, unknown>;
  assert.equal(readBody.smtp_host, "smtp.env.example");
  assert.equal(readBody.password_set, true);
  assert.equal(readBody.password_unreadable, false);
  assert.equal(Object.hasOwn(readBody, "password"), false);
  assert.equal(read.body.includes("env-secret"), false);

  const admin = await call("GET", "/workspaces/:workspaceId/server-mail-settings", ADMIN_ID);
  assert.equal(admin.statusCode, 403);
  const member = await call("PATCH", "/workspaces/:workspaceId/server-mail-settings", MEMBER_ID, {
    smtp_host: "nope.example",
  });
  assert.equal(member.statusCode, 403);

  const saved = await call("PATCH", "/workspaces/:workspaceId/server-mail-settings", OWNER_ID, {
    smtp_host: "smtp.saved.example",
    smtp_port: 465,
    smtp_tls_mode: "tls",
    smtp_username: "saved-user",
    email_from: "saved@example.com",
    public_app_url: "https://links.example",
    password: "saved-secret",
  });
  assert.equal(saved.statusCode, 200, saved.body);
  const savedBody = JSON.parse(saved.body) as Record<string, unknown>;
  assert.equal(savedBody.public_app_url, "https://links.example");
  assert.equal(savedBody.password_set, true);
  assert.equal(saved.body.includes("saved-secret"), false);
  assert.ok(store.row?.smtpPasswordCiphertext);
  assert.equal(store.row.smtpPasswordCiphertext.toString("utf8").includes("saved-secret"), false);

  const kept = await call("PATCH", "/workspaces/:workspaceId/server-mail-settings", OWNER_ID, {
    password: "",
    smtp_host: "smtp.kept.example",
  });
  assert.equal(kept.statusCode, 200, kept.body);
  assert.equal(
    openSecret(deriveSmtpPasswordKey(mailConfig().sessionSecret), store.row!.smtpPasswordCiphertext!).toString("utf8"),
    "saved-secret",
  );

  const saasHandlers = new Map<string, (ctx: {
    requestId: string;
    req: IncomingMessage;
    res: MockResponse;
    params: Record<string, string>;
  }) => Promise<void>>();
  registerServerMailSettingsRoutes(
    (method, path, handler) => {
      saasHandlers.set(`${method} ${path}`, handler as never);
    },
    createTestApiConfig({ deploymentMode: "saas" }),
    service,
    async () => OWNER_ID,
  );
  const saasHandler = saasHandlers.get("GET /workspaces/:workspaceId/server-mail-settings");
  assert.ok(saasHandler);
  const saasRes = new MockResponse();
  await saasHandler({
    requestId: "req_saas",
    req: { method: "GET", headers: { "x-user-id": OWNER_ID } } as IncomingMessage,
    res: saasRes as unknown as ServerResponse,
    params: { workspaceId: WORKSPACE_ID },
  });
  assert.equal(saasRes.statusCode, 404);
});

test("test email uses the form values and is sent to the owner", async () => {
  const { service, sent } = createService();
  await service.sendTestEmail(WORKSPACE_ID, OWNER_ID, {
    smtpHost: "smtp.form.example",
    smtpPort: 587,
    smtpTlsMode: "starttls",
    smtpUsername: "form-user",
    emailFrom: "form@example.com",
    publicAppUrl: "https://form.example",
    password: "form-secret",
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.to, "owner@example.com");
  assert.equal(sent[0]?.from, "form@example.com");
  assert.match(sent[0]?.text ?? "", /https:\/\/form\.example/);
  assert.equal(JSON.stringify(sent[0]).includes("form-secret"), false);
});

test("test email reports the transport cause", async () => {
  const store = new MemoryMailStore();
  const service = new MailSettingsService({
    store,
    config: mailConfig(),
    users: {
      findById: async () => ({ email: "owner@example.com" }),
    },
    workspaces: {
      findById: async () => ({ ownerId: OWNER_ID }),
      hasAccess: async () => true,
    },
    sendSmtp: async () => {
      const error = new Error("smtp send failed");
      (error as { details?: { cause?: string } }).details = { cause: "connect ECONNREFUSED" };
      throw error;
    },
  });
  await assert.rejects(
    () =>
      service.sendTestEmail(WORKSPACE_ID, OWNER_ID, {
        smtpHost: "smtp.form.example",
        smtpPort: 587,
        smtpTlsMode: "starttls",
        emailFrom: "form@example.com",
      }),
    (error: unknown) => {
      assert.equal((error as { statusCode?: number }).statusCode, 502);
      assert.equal((error as { message?: string }).message, "connect ECONNREFUSED");
      return true;
    },
  );
});

test("runtime sender uses the database SMTP host and sender without restart", async () => {
  const calls: Array<{ host: string; from: string }> = [];
  const sender = new RuntimeEmailSender(
    {
      async send() {
        throw new Error("base provider should not send");
      },
    },
    {
      async effective() {
        return {
          smtpHost: "smtp.live.example",
          smtpPort: 587,
          smtpTlsMode: "starttls",
          smtpUsername: "live",
          smtpPassword: "live-secret",
          emailFrom: "live@example.com",
          publicAppBaseUrl: "https://live.example",
          passwordSet: true,
          passwordUnreadable: false,
          useSmtpTransport: true,
        };
      },
    },
    async (snapshot, message) => {
      calls.push({ host: snapshot.smtpHost, from: message.from });
    },
  );
  await sender.send({
    to: "person@example.com",
    from: "stale@example.com",
    subject: "Hello",
    text: "Hi",
    html: "<p>Hi</p>",
  });
  assert.deepEqual(calls, [{ host: "smtp.live.example", from: "live@example.com" }]);
});

test("unreadable stored password falls back to environment SMTP and sets the flag", async () => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const store = new MemoryMailStore();
  store.row = unreadableRow();
  const sentSnapshots: MailDeliverySnapshot[] = [];
  const { service } = createService(store, {
    logger: {
      info() {},
      warn(message, extra) {
        warnings.push(JSON.stringify({ message, extra }));
      },
      error(message, extra) {
        errors.push(JSON.stringify({ message, extra }));
      },
    },
    sentSnapshots,
  });

  const sender = new RuntimeEmailSender(
    {
      async send() {
        throw new Error("base provider should not send");
      },
    },
    service,
    async (snapshot, message) => {
      sentSnapshots.push(snapshot);
      assert.equal(message.from, "db@example.com");
    },
  );
  await sender.send({
    to: "person@example.com",
    from: "stale@example.com",
    subject: "Code",
    text: "123456",
    html: "<p>123456</p>",
  });

  assert.equal(sentSnapshots[0]?.smtpHost, "smtp.env.example");
  assert.equal(sentSnapshots[0]?.smtpPort, 2525);
  assert.equal(sentSnapshots[0]?.smtpTlsMode, "starttls");
  assert.equal(sentSnapshots[0]?.smtpUsername, "env-user");
  assert.equal(sentSnapshots[0]?.smtpPassword, "env-secret");
  assert.equal(sentSnapshots[0]?.emailFrom, "db@example.com");
  assert.equal(sentSnapshots[0]?.publicAppBaseUrl, "https://vault.customer.example");
  assert.equal(sentSnapshots[0]?.passwordUnreadable, true);
  assert.equal(sentSnapshots[0]?.useSmtpTransport, true);

  const settings = await service.getForOwner(WORKSPACE_ID, OWNER_ID);
  assert.equal(settings.passwordUnreadable, true);
  assert.equal(settings.passwordSet, false);
  assert.equal(settings.smtpHost, "smtp.db.example");
  assert.equal(settings.smtpUsername, "db-user");
  assert.equal(settings.emailFrom, "db@example.com");
  assert.equal(JSON.stringify(settings).includes("env-secret"), false);
  assert.equal(JSON.stringify(settings).includes("db-secret"), false);

  await service.sendTestEmail(WORKSPACE_ID, OWNER_ID, {
    smtpHost: "smtp.db.example",
    smtpPort: 587,
    smtpUsername: "db-user",
  });
  assert.equal(sentSnapshots[1]?.smtpHost, "smtp.env.example");
  assert.equal(sentSnapshots[1]?.smtpPassword, "env-secret");
  assert.equal(sentSnapshots[1]?.smtpUsername, "env-user");

  assert.equal(errors.length, 0);
  assert.ok(warnings.length >= 1);
  const dumped = warnings.join("\n");
  assert.match(dumped, /using environment smtp configuration/);
  assert.equal(dumped.includes("env-secret"), false);
  assert.equal(dumped.includes("db-secret"), false);
  assert.equal(dumped.includes(mailConfig().sessionSecret), false);
});

test("unreadable stored password without an environment password is a 4xx on test email", async () => {
  const store = new MemoryMailStore();
  store.row = unreadableRow();
  const sentSnapshots: MailDeliverySnapshot[] = [];
  const { service, sent } = createService(store, {
    config: mailConfig({ smtpPassword: "" }),
    sentSnapshots,
  });

  const settings = await service.getForOwner(WORKSPACE_ID, OWNER_ID);
  assert.equal(settings.passwordUnreadable, true);
  assert.equal(settings.passwordSet, false);
  assert.equal(settings.smtpHost, "smtp.db.example");

  await assert.rejects(
    () => service.sendTestEmail(WORKSPACE_ID, OWNER_ID, {}),
    (error: unknown) => {
      assert.equal((error as { statusCode?: number }).statusCode, 409);
      assert.equal((error as { code?: string }).code, "SMTP_PASSWORD_UNAVAILABLE");
      assert.equal((error as { message?: string }).message.includes("db-secret"), false);
      return true;
    },
  );

  await service.sendTestEmail(WORKSPACE_ID, OWNER_ID, {
    smtpHost: "smtp.db.example",
    smtpPort: 587,
    smtpTlsMode: "starttls",
    emailFrom: "db@example.com",
    password: "typed-secret",
  });
  assert.equal(sentSnapshots[0]?.smtpHost, "smtp.db.example");
  assert.equal(sentSnapshots[0]?.smtpPassword, "typed-secret");
  assert.equal(JSON.stringify(sent).includes("typed-secret"), false);

  const handlers = new Map<string, (ctx: {
    requestId: string;
    req: IncomingMessage;
    res: MockResponse;
    params: Record<string, string>;
  }) => Promise<void>>();
  registerServerMailSettingsRoutes(
    (method, path, handler) => {
      handlers.set(`${method} ${path}`, handler as never);
    },
    mailConfig(),
    service,
    async () => OWNER_ID,
  );
  const handler = handlers.get("POST /workspaces/:workspaceId/server-mail-settings/test-email");
  assert.ok(handler);
  const res = new MockResponse();
  await handler({
    requestId: "req_unreadable",
    req: { method: "POST", headers: { "x-user-id": OWNER_ID }, body: {} } as IncomingMessage,
    res: res as unknown as ServerResponse,
    params: { workspaceId: WORKSPACE_ID },
  });
  assert.equal(res.statusCode, 409);
  const body = JSON.parse(res.body) as { error?: string };
  assert.equal(body.error, "SMTP_PASSWORD_UNAVAILABLE");

  const read = handlers.get("GET /workspaces/:workspaceId/server-mail-settings");
  assert.ok(read);
  const readRes = new MockResponse();
  await read({
    requestId: "req_unreadable_get",
    req: { method: "GET", headers: { "x-user-id": OWNER_ID } } as IncomingMessage,
    res: readRes as unknown as ServerResponse,
    params: { workspaceId: WORKSPACE_ID },
  });
  assert.equal(readRes.statusCode, 200);
  assert.equal((JSON.parse(readRes.body) as { password_unreadable?: boolean }).password_unreadable, true);
});

test("saving a new password clears the unreadable state", async () => {
  const store = new MemoryMailStore();
  store.row = unreadableRow();
  const { service } = createService(store);

  const before = await service.getForOwner(WORKSPACE_ID, OWNER_ID);
  assert.equal(before.passwordUnreadable, true);

  const updated = await service.updateForOwner(WORKSPACE_ID, OWNER_ID, { password: "rotated-secret" });
  assert.equal(updated.passwordUnreadable, false);
  assert.equal(updated.passwordSet, true);
  assert.equal(updated.smtpHost, "smtp.db.example");
  assert.equal(JSON.stringify(updated).includes("rotated-secret"), false);

  const effective = await service.effective();
  assert.equal(effective.passwordUnreadable, false);
  assert.equal(effective.smtpPassword, "rotated-secret");
  assert.equal(effective.smtpHost, "smtp.db.example");
  assert.equal(effective.smtpUsername, "db-user");
  assert.equal(
    openSecret(deriveSmtpPasswordKey(mailConfig().sessionSecret), store.row!.smtpPasswordCiphertext!).toString("utf8"),
    "rotated-secret",
  );

  const again = await service.getForOwner(WORKSPACE_ID, OWNER_ID);
  assert.equal(again.passwordUnreadable, false);
});
