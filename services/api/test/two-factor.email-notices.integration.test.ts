import test from "node:test";
import assert from "node:assert/strict";
import { formatEmailMessage } from "@okkey/i18n";
import { testEntityId } from "./test-entity-id.ts";
import { AuthService } from "../src/auth/service.ts";
import { loadConfig, type ApiConfig } from "../src/config.ts";
import { EmailTemplateService, type EmailMessage } from "../src/email/service.ts";
import { SessionService } from "../src/session/service.ts";
import { createStorageLayer } from "../src/storage/index.ts";
import { TwoFactorService } from "../src/two-factor/service.ts";
import {
  applyMigrations,
  cleanupUserData,
  createLoggerStub,
  flushOutboundEmailTasks,
  registerUser,
  totpCodeForSecret,
} from "./two-factor-test-helpers.ts";

/** Plaintext backup codes look like `ABCD-EFGH-12` (hex groups). */
const BACKUP_CODE_LIKE = /\b[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{2}\b/;

test("integration: after TOTP enroll confirm, transport receives two_factor_enabled (ru) without backup codes", async (t) => {
  const base = loadConfig();
  const fixed = new Date("2026-06-20T09:00:00.000Z");
  const config: ApiConfig = { ...base, twoFactorBackupCodesCount: 4 };
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);
  const suffix = testEntityId();
  const email = `2fa-mail-enroll-${suffix}@okkey.local`;

  const sent: EmailMessage[] = [];
  const captureSender = {
    send: async (m: EmailMessage) => {
      sent.push(m);
    },
  };
  const emailTemplates = new EmailTemplateService(captureSender, {
    from: config.emailFrom,
    defaultLocale: config.defaultEmailLocale,
    publicAppBaseUrl: config.publicAppBaseUrl,
  });
  const authService = new AuthService({
    redis: storage.redis,
    users: storage.repositories.users,
    emailTemplates: new EmailTemplateService({ send: async () => {} }, {
      from: config.emailFrom,
      defaultLocale: config.defaultEmailLocale,
      publicAppBaseUrl: config.publicAppBaseUrl,
    }),
    config,
    now: () => fixed,
  });
  const sessionService = new SessionService({
    sessions: storage.repositories.sessions,
    config,
    now: () => fixed,
  });
  const twoFactor = new TwoFactorService({
    redis: storage.redis,
    twoFactorRepo: storage.repositories.twoFactor,
    users: storage.repositories.users,
    authService,
    sessionService,
    config,
    emailTemplates,
    now: () => fixed,
  });

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);
  await storage.postgres.query("UPDATE users SET locale = $1 WHERE id = $2", ["ru", userId]);

  const start = await twoFactor.enrollTotpStart(userId);
  const enrollCode = totpCodeForSecret(start.secretBase32, fixed);
  const { backupCodes } = await twoFactor.enrollTotpConfirm(
    userId,
    { enrollmentId: start.enrollmentId, code: enrollCode },
    { acceptLanguage: "en-US,en;q=0.9" },
  );

  await flushOutboundEmailTasks();

  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, formatEmailMessage("ru", "email.twoFactor.enabled.subject", {}));
  assert.equal(sent[0].to, email);
  for (const code of backupCodes) {
    assert.equal(sent[0].text.includes(code), false, "plaintext backup codes must not appear in email");
    assert.equal(sent[0].html.includes(code), false, "backup codes must not appear in HTML");
  }
  assert.equal(BACKUP_CODE_LIKE.test(sent[0].text), false);
  assert.equal(BACKUP_CODE_LIKE.test(sent[0].html), false);
  assert.equal(sent[0].text.includes("{{"), false);
  assert.equal(sent[0].html.toLowerCase().includes("totp"), false);
});

test("integration: after backup regeneration, transport receives two_factor_backup_codes_regenerated (ru)", async (t) => {
  const base = loadConfig();
  const fixed = new Date("2026-06-20T10:30:00.000Z");
  const config: ApiConfig = { ...base, twoFactorBackupCodesCount: 3 };
  const storage = await createStorageLayer(config, createLoggerStub());
  await applyMigrations(storage);
  const suffix = testEntityId();
  const email = `2fa-mail-regen-${suffix}@okkey.local`;

  const sent: EmailMessage[] = [];
  const captureSender = {
    send: async (m: EmailMessage) => {
      sent.push(m);
    },
  };
  const noopTemplates = new EmailTemplateService({ send: async () => {} }, {
    from: config.emailFrom,
    defaultLocale: config.defaultEmailLocale,
    publicAppBaseUrl: config.publicAppBaseUrl,
  });
  const emailTemplates = new EmailTemplateService(captureSender, {
    from: config.emailFrom,
    defaultLocale: config.defaultEmailLocale,
    publicAppBaseUrl: config.publicAppBaseUrl,
  });
  const authService = new AuthService({
    redis: storage.redis,
    users: storage.repositories.users,
    emailTemplates: noopTemplates,
    config,
    now: () => fixed,
  });
  const sessionService = new SessionService({
    sessions: storage.repositories.sessions,
    config,
    now: () => fixed,
  });
  const twoFactor = new TwoFactorService({
    redis: storage.redis,
    twoFactorRepo: storage.repositories.twoFactor,
    users: storage.repositories.users,
    authService,
    sessionService,
    config,
    emailTemplates,
    now: () => fixed,
  });

  t.after(async () => {
    try {
      await cleanupUserData(storage, email);
    } finally {
      await storage.close();
    }
  });

  const { userId } = await registerUser(storage, config, email);
  await storage.postgres.query("UPDATE users SET locale = $1 WHERE id = $2", ["ru", userId]);

  const start = await twoFactor.enrollTotpStart(userId);
  const enrollCode = totpCodeForSecret(start.secretBase32, fixed);
  await twoFactor.enrollTotpConfirm(userId, {
    enrollmentId: start.enrollmentId,
    code: enrollCode,
  });
  await flushOutboundEmailTasks();
  sent.length = 0;

  const regenTotp = totpCodeForSecret(start.secretBase32, fixed);
  const { backupCodes: newCodes } = await twoFactor.regenerateBackupCodes(userId, regenTotp, {
    acceptLanguage: "en",
  });
  await flushOutboundEmailTasks();

  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, formatEmailMessage("ru", "email.twoFactor.backupRegen.subject", {}));
  assert.equal(sent[0].to, email);
  for (const code of newCodes) {
    assert.equal(sent[0].text.includes(code), false);
    assert.equal(sent[0].html.includes(code), false);
  }
  assert.equal(BACKUP_CODE_LIKE.test(sent[0].text), false);
  assert.equal(BACKUP_CODE_LIKE.test(sent[0].html), false);
  assert.equal(sent[0].text.includes("{{"), false);
});
