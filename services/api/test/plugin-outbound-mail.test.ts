import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createApiApp } from "../src/app.ts";
import { deriveSmtpPasswordKey, sealSecret } from "../src/crypto/server-aes.ts";
import { wipeSecretBytes } from "../src/crypto/secret-lifecycle.ts";
import {
  RuntimeEmailSender,
  type EmailMessage,
  type EmailSender,
} from "../src/email/service.ts";
import { MailSettingsService } from "../src/mail-settings/service.ts";
import type {
  MailDeliverySnapshot,
  ServerMailSettingsRow,
  ServerMailSettingsStore,
} from "../src/mail-settings/types.ts";
import {
  createPluginOutboundMailApi,
  type PluginOutboundEmailMessage,
} from "../src/plugins/outbound-mail.ts";
import type { ApiEnterprisePluginContext } from "../src/plugins/types.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const SECRET_PASSWORD = "smtp-db-secret-do-not-leak";

class MemoryMailStore implements ServerMailSettingsStore {
  row: ServerMailSettingsRow | null = null;

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
    this.row = {
      ...row,
      updatedBy,
      smtpPasswordCiphertext: row.smtpPasswordCiphertext
        ? Buffer.from(row.smtpPasswordCiphertext)
        : null,
    };
  }

  async claimLegacySmtpProbe(): Promise<ServerMailSettingsRow | null> {
    return null;
  }

  async markLegacySmtpVerified(): Promise<boolean> {
    return false;
  }
}

function sealPassword(sessionSecret: string, password: string): Buffer {
  const key = deriveSmtpPasswordKey(sessionSecret);
  try {
    return sealSecret(key, Buffer.from(password, "utf8"));
  } finally {
    wipeSecretBytes(key);
  }
}

function activeMailRow(config: ReturnType<typeof createTestApiConfig>): ServerMailSettingsRow {
  return {
    smtpHost: "smtp.db.example",
    smtpPort: 587,
    smtpTlsMode: "starttls",
    smtpUsername: "db-user",
    smtpPasswordCiphertext: sealPassword(config.sessionSecret, SECRET_PASSWORD),
    emailFrom: "db-from@example.com",
    publicAppUrl: "https://app.customer.example",
    smtpVerifiedAt: "2026-01-15T00:00:00.000Z",
    smtpLegacyProbedAt: "2026-01-15T00:00:00.000Z",
    updatedBy: "tester",
  };
}

test("createPluginOutboundMailApi: logger provider without mail settings is inactive", async () => {
  const api = createPluginOutboundMailApi({
    config: createTestApiConfig({ emailProvider: "logger" }),
    fallbackFrom: "no-reply@okkey.local",
  });
  assert.equal(await api.isOutboundMailActive(), false);
});

test("createPluginOutboundMailApi: verified DB mail settings are active and send via the shared sender", async () => {
  const config = createTestApiConfig({
    deploymentMode: "self_hosted",
    emailProvider: "logger",
    emailFrom: "env@example.com",
  });
  const store = new MemoryMailStore();
  store.row = activeMailRow(config);
  const mailSettings = new MailSettingsService({
    store,
    config,
    users: { findById: async () => ({ email: "owner@example.com" }) },
    workspaces: {
      findById: async () => ({ ownerId: "1" }),
      hasAccess: async () => true,
    },
  });
  assert.equal(await mailSettings.isOutboundActive(), true);

  const sent: EmailMessage[] = [];
  const smtpCalls: Array<{ host: string; from: string; password: string }> = [];
  const runtimeSender = new RuntimeEmailSender(
    {
      async send() {
        throw new Error("base logger provider must not send when DB SMTP is active");
      },
    },
    mailSettings,
    async (snapshot: MailDeliverySnapshot, message: EmailMessage) => {
      smtpCalls.push({
        host: snapshot.smtpHost,
        from: message.from,
        password: snapshot.smtpPassword,
      });
      sent.push(message);
    },
  );

  const api = createPluginOutboundMailApi({
    config,
    mailSettings,
    emailSender: runtimeSender,
    fallbackFrom: config.emailFrom,
  });

  assert.equal(await api.isOutboundMailActive(), true);
  await api.sendOutboundEmail({
    to: "recipient@example.com",
    subject: "Plugin notice",
    text: "hello",
    html: "<p>hello</p>",
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.to, "recipient@example.com");
  assert.equal(sent[0]?.from, "db-from@example.com");
  assert.equal(sent[0]?.subject, "Plugin notice");
  assert.equal(smtpCalls[0]?.host, "smtp.db.example");
  assert.equal(smtpCalls[0]?.password, SECRET_PASSWORD);

  const dumped = JSON.stringify({ sent, apiKeys: Object.keys(api) });
  assert.equal(dumped.includes(SECRET_PASSWORD), false);
  assert.equal(dumped.includes("smtpPassword"), false);
});

test("createPluginOutboundMailApi: exposed message surface has no password fields", () => {
  const sample: PluginOutboundEmailMessage = {
    to: "a@example.com",
    subject: "s",
    text: "t",
    html: "<p>t</p>",
  };
  assert.deepEqual(Object.keys(sample).sort(), ["html", "subject", "text", "to"]);

  const sourcePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../src/plugins/outbound-mail.ts",
  );
  const source = readFileSync(sourcePath, "utf8");
  const typeBlock = source.match(
    /export type PluginOutboundEmailMessage = \{[\s\S]*?\};/,
  )?.[0];
  assert.ok(typeBlock);
  assert.equal(/password/i.test(typeBlock), false);
  assert.equal(/smtp/i.test(typeBlock), false);
});

test("createPluginOutboundMailApi: hanging send is hard-timed out", async () => {
  const hang = new Promise<void>(() => {
    /* never resolves */
  });
  const emailSender: EmailSender = {
    send: async () => hang,
  };
  const api = createPluginOutboundMailApi({
    config: createTestApiConfig({ emailProvider: "smtp", smtpHost: "smtp.example.com" }),
    emailSender,
    fallbackFrom: "no-reply@okkey.local",
    sendTimeoutMs: 40,
  });
  await assert.rejects(
    () =>
      api.sendOutboundEmail({
        to: "a@example.com",
        subject: "timeout",
        text: "t",
        html: "<p>t</p>",
      }),
    (error: unknown) =>
      error instanceof Error && /timed out after/i.test(error.message),
  );
});

test("ApiEnterprisePluginContext wires outbound mail without exposing SMTP secrets", async () => {
  const config = createTestApiConfig({
    deploymentMode: "self_hosted",
    emailProvider: "logger",
    emailFrom: "env@example.com",
  });
  const store = new MemoryMailStore();
  store.row = activeMailRow(config);
  const mailSettings = new MailSettingsService({
    store,
    config,
    users: { findById: async () => ({ email: "owner@example.com" }) },
    workspaces: {
      findById: async () => ({ ownerId: "1" }),
      hasAccess: async () => true,
    },
  });

  const sent: EmailMessage[] = [];
  const emailSender: EmailSender = {
    async send(message) {
      sent.push(message);
    },
  };

  let ctx: ApiEnterprisePluginContext | null = null;
  const app = createApiApp(
    config,
    { info() {}, warn() {}, error() {} },
    { mailSettingsService: mailSettings },
    {
      postgres: {
        query: async () => [],
        transaction: async (fn) => fn({ query: async () => [] }),
      } as never,
      workspacesRepository: {
        findById: async () => null,
        hasAccess: async () => false,
        create: async () => {
          throw new Error("unused");
        },
        countOwnedByUser: async () => 0,
        listByOwner: async () => [],
        listAccessibleByUser: async () => [],
      },
      emailSender,
      enterprisePlugins: [
        {
          id: "outbound-mail-test",
          register(pluginCtx) {
            ctx = pluginCtx;
          },
        },
      ],
    },
  );
  await app.pluginsReady;
  assert.ok(ctx);
  const pluginCtx = ctx as ApiEnterprisePluginContext;

  assert.equal(typeof pluginCtx.isOutboundMailActive, "function");
  assert.equal(typeof pluginCtx.sendOutboundEmail, "function");
  assert.equal(await pluginCtx.isOutboundMailActive(), true);

  await pluginCtx.sendOutboundEmail({
    to: "plugin@example.com",
    subject: "from context",
    text: "body",
    html: "<p>body</p>",
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.from, "db-from@example.com");
  assert.equal(sent[0]?.to, "plugin@example.com");

  const surface = JSON.stringify({
    keys: Object.keys(pluginCtx).sort(),
    proto: Object.getOwnPropertyNames(pluginCtx).sort(),
  });
  assert.equal(surface.includes("password"), false);
  assert.equal(surface.includes(SECRET_PASSWORD), false);
  assert.equal(surface.includes("smtpPassword"), false);
  assert.ok(surface.includes("isOutboundMailActive"));
  assert.ok(surface.includes("sendOutboundEmail"));
});

test("ApiEnterprisePluginContext: logger without mail settings reports inactive", async () => {
  let ctx: ApiEnterprisePluginContext | null = null;
  const app = createApiApp(
    createTestApiConfig({ emailProvider: "logger" }),
    { info() {}, warn() {}, error() {} },
    {},
    {
      postgres: {
        query: async () => [],
        transaction: async (fn) => fn({ query: async () => [] }),
      } as never,
      workspacesRepository: {
        findById: async () => null,
        hasAccess: async () => false,
        create: async () => {
          throw new Error("unused");
        },
        countOwnedByUser: async () => 0,
        listByOwner: async () => [],
        listAccessibleByUser: async () => [],
      },
      enterprisePlugins: [
        {
          id: "outbound-mail-inactive-test",
          register(pluginCtx) {
            ctx = pluginCtx;
          },
        },
      ],
    },
  );
  await app.pluginsReady;
  assert.ok(ctx);
  assert.equal(await (ctx as ApiEnterprisePluginContext).isOutboundMailActive(), false);
});
