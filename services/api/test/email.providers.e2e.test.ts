import test from "node:test";
import assert from "node:assert/strict";
import { formatEmailMessage } from "@okkey/i18n";
import { createServer } from "node:http";
import { testEntityId } from "./test-entity-id.ts";
import { SMTPServer } from "smtp-server";
import { AuthService } from "../src/auth/service.ts";
import { createApiApp } from "../src/app.ts";
import type { ApiConfig } from "../src/config.ts";
import { createTestApiConfig } from "./test-api-config.ts";
import {
  createEmailSender,
  EmailTemplateService,
} from "../src/email/service.ts";

class InMemoryRedis {
  private readonly values = new Map<string, string>();
  private readonly counters = new Map<string, number>();

  async setWithTtl(key: string, value: string, _ttlSeconds: number): Promise<void> {
    this.values.set(key, value);
  }

  async setIfNotExistsWithTtl(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    if (this.values.has(key)) {
      return false;
    }
    await this.setWithTtl(key, value, ttlSeconds);
    return true;
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async del(key: string): Promise<number> {
    const existed = this.values.delete(key);
    this.counters.delete(key);
    return existed ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }

  async expire(_key: string, _seconds: number): Promise<boolean> {
    return true;
  }
}

function testConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return createTestApiConfig({
    port: 0,
    authRateLimitStartPerEmail: 50,
    authRateLimitStartPerIp: 50,
    authRateLimitConfirmPerIp: 50,
    authRateLimitResendPerIp: 50,
    smtpHost: "127.0.0.1",
    emailApiTimeoutMs: 5000,
    ...overrides,
  });
}

async function startApiForEmailProvider(config: ApiConfig): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const logger = {
    info(_message: string, _extra?: Record<string, unknown>) {},
    warn(_message: string, _extra?: Record<string, unknown>) {},
    error(_message: string, _extra?: Record<string, unknown>) {},
  };
  const sender = await createEmailSender(config, logger);
  const templateService = new EmailTemplateService(sender, {
    from: config.emailFrom,
    defaultLocale: config.defaultEmailLocale,
    publicAppBaseUrl: config.publicAppBaseUrl,
  });

  const authService = new AuthService({
    redis: new InMemoryRedis(),
    users: {
      findByEmail: async () => null,
      isTwoFactorEnabled: async () => false,
      hasAnyUsers: async () => true,
    },
    emailTemplates: templateService,
    config,
    generateCode: () => "123456",
    generateId: () => testEntityId(),
  });

  const app = createApiApp(config, logger, {
    authService,
  });
  const server = createServer(app.handler());

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to start test api server");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

test("e2e: smtp provider sends auth email via SMTP server", async (t) => {
  let smtpRaw = "";
  const smtpServer = new SMTPServer({
    disabledCommands: ["AUTH", "STARTTLS"],
    authOptional: true,
    onData(stream, _session, callback) {
      stream.on("data", (chunk) => {
        smtpRaw += chunk.toString("utf8");
      });
      stream.on("end", () => {
        callback(null);
      });
    },
  });

  await new Promise<void>((resolve) => {
    smtpServer.listen(0, "127.0.0.1", () => resolve());
  });
  t.after(async () => {
    await new Promise<void>((resolve) => {
      smtpServer.close(() => resolve());
    });
  });

  const address = smtpServer.server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to start smtp server");
  }

  const api = await startApiForEmailProvider(
    testConfig({
      emailProvider: "smtp",
      smtpHost: "127.0.0.1",
      smtpPort: address.port,
      smtpSecure: false,
    }),
  );
  t.after(async () => {
    await api.close();
  });

  const response = await fetch(`${api.url}/auth/email/start`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "127.0.0.1",
    },
    body: JSON.stringify({
      email: "user@example.com",
      locale: "en",
    }),
  });

  assert.equal(response.status, 200);
  assert.match(
    smtpRaw,
    /Subject: 123456 is your Okkey registration verification code/i,
  );
  assert.match(smtpRaw, /123456/);
});

async function startHttpApiCapture(t: {
  after: (fn: () => Promise<void> | void) => void;
}): Promise<{
  endpoint: string;
  getBody: () => string;
  getAuth: () => string;
}> {
  let providerRequestBody = "";
  let providerAuthHeader = "";
  const provider = createServer((req, res) => {
    providerAuthHeader = req.headers.authorization ?? "";
    req.on("data", (chunk) => {
      providerRequestBody += chunk.toString("utf8");
    });
    req.on("end", () => {
      res.statusCode = 202;
      res.end();
    });
  });

  await new Promise<void>((resolve) => {
    provider.listen(0, "127.0.0.1", () => resolve());
  });
  t.after(async () => {
    await new Promise<void>((resolve) => {
      provider.close(() => resolve());
    });
  });

  const providerAddress = provider.address();
  if (!providerAddress || typeof providerAddress === "string") {
    throw new Error("failed to start http provider");
  }

  return {
    endpoint: `http://127.0.0.1:${providerAddress.port}/send`,
    getBody: () => providerRequestBody,
    getAuth: () => providerAuthHeader,
  };
}

test("e2e: http-api provider posts email payload to external api", async (t) => {
  const capture = await startHttpApiCapture(t);
  const api = await startApiForEmailProvider(
    testConfig({
      emailProvider: "http-api",
      emailApiEndpoint: capture.endpoint,
      emailApiKey: "test-api-key",
      emailHttpApiInlineMode: "cid",
    }),
  );
  t.after(async () => {
    await api.close();
  });

  const response = await fetch(`${api.url}/auth/email/start`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "127.0.0.1",
    },
    body: JSON.stringify({
      email: "user@example.com",
      locale: "ru",
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(capture.getAuth(), "Bearer test-api-key");
  assert.match(capture.getBody(), /"to":"user@example.com"/);
  const parsed = JSON.parse(capture.getBody()) as {
    subject?: string;
    html?: string;
    inlineAttachments?: Array<{ cid: string; contentType: string; contentBase64: string }>;
  };
  assert.equal(
    parsed.subject,
    formatEmailMessage("ru", "email.auth.registrationCode.subject", { code: "123456" }),
  );
  assert.match(parsed.html ?? "", /cid:okkey-mark/);
  assert.equal(parsed.inlineAttachments?.length, 1);
  assert.equal(parsed.inlineAttachments?.[0]?.cid, "okkey-mark");
  assert.equal(parsed.inlineAttachments?.[0]?.contentType, "image/png");
  assert.ok((parsed.inlineAttachments?.[0]?.contentBase64 ?? "").length > 32);
});

test("e2e: http-api none mode omits logo img and inlineAttachments", async (t) => {
  const capture = await startHttpApiCapture(t);
  const api = await startApiForEmailProvider(
    testConfig({
      emailProvider: "http-api",
      emailApiEndpoint: capture.endpoint,
      emailApiKey: "test-api-key",
      emailHttpApiInlineMode: "none",
    }),
  );
  t.after(async () => {
    await api.close();
  });

  const response = await fetch(`${api.url}/auth/email/start`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "127.0.0.1",
    },
    body: JSON.stringify({ email: "none@example.com", locale: "en" }),
  });
  assert.equal(response.status, 200);
  const parsed = JSON.parse(capture.getBody()) as {
    html?: string;
    inlineAttachments?: unknown;
  };
  assert.equal((parsed.html ?? "").includes("<img"), false);
  assert.match(parsed.html ?? "", /Okkey/);
  assert.equal(parsed.inlineAttachments, undefined);
});

test("e2e: http-api url mode rewrites logo src and omits inlineAttachments", async (t) => {
  const capture = await startHttpApiCapture(t);
  const logoUrl = "https://cdn.example.com/okkey-mark.png";
  const api = await startApiForEmailProvider(
    testConfig({
      emailProvider: "http-api",
      emailApiEndpoint: capture.endpoint,
      emailApiKey: "test-api-key",
      emailHttpApiInlineMode: "url",
      emailLogoUrl: logoUrl,
    }),
  );
  t.after(async () => {
    await api.close();
  });

  const response = await fetch(`${api.url}/auth/email/start`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "127.0.0.1",
    },
    body: JSON.stringify({ email: "url@example.com", locale: "en" }),
  });
  assert.equal(response.status, 200);
  const parsed = JSON.parse(capture.getBody()) as {
    html?: string;
    inlineAttachments?: unknown;
  };
  assert.match(parsed.html ?? "", /src="https:\/\/cdn\.example\.com\/okkey-mark\.png"/);
  assert.equal((parsed.html ?? "").includes("cid:okkey-mark"), false);
  assert.equal(parsed.inlineAttachments, undefined);
});

test("e2e: http-api data mode embeds data URI and omits inlineAttachments", async (t) => {
  const capture = await startHttpApiCapture(t);
  const api = await startApiForEmailProvider(
    testConfig({
      emailProvider: "http-api",
      emailApiEndpoint: capture.endpoint,
      emailApiKey: "test-api-key",
      emailHttpApiInlineMode: "data",
    }),
  );
  t.after(async () => {
    await api.close();
  });

  const response = await fetch(`${api.url}/auth/email/start`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "127.0.0.1",
    },
    body: JSON.stringify({ email: "data@example.com", locale: "en" }),
  });
  assert.equal(response.status, 200);
  const parsed = JSON.parse(capture.getBody()) as {
    html?: string;
    inlineAttachments?: unknown;
  };
  assert.match(parsed.html ?? "", /src="data:image\/png;base64,/);
  assert.equal((parsed.html ?? "").includes("cid:okkey-mark"), false);
  assert.equal(parsed.inlineAttachments, undefined);
});
