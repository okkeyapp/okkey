import test from "node:test";
import assert from "node:assert/strict";
import { formatEmailMessage } from "@okkey/i18n";
import { renderEmailTemplate } from "../src/email/catalog.ts";
import { EmailTemplateError } from "../src/email/errors.ts";
import {
  normalizeSupportedLocaleTag,
  parsePrimaryLocaleFromAcceptLanguage,
  resolveEmailLocaleForRecipient,
} from "../src/email/locale.ts";
import { EmailTemplateService, type EmailSender } from "../src/email/service.ts";
import { createTestApiConfig } from "./test-api-config.ts";

const deviceVars = {
  deviceName: "Mobile Android - App",
  platform: "Mobile · App",
  osName: "Android",
  requestIp: "198.51.100.2",
  helpUrl: "https://app.example/items?popup=settings|devices",
} as const;

const workspaceVars = {
  inviterDisplayName: "Sam",
  workspaceName: "Lab",
  inviteUrl: "https://app.example/invite/token-abc",
} as const;

const twoFactorVars = {
  occurredAtIso: "2026-01-01T12:00:00.000Z",
  securitySettingsUrl: "https://app.example/items?popup=settings|twoFactor",
} as const;

function assertNoMustachePlaceholders(s: string): void {
  assert.equal(s.includes("{{"), false);
}

test("renderEmailTemplate auth_email_code en and ru", async () => {
  const en = await renderEmailTemplate("auth_email_code", "en", {
    code: "123456",
    ttlSeconds: 120,
  });
  assert.equal(
    en.subject,
    formatEmailMessage("en", "email.auth.signInCode.subject", { code: "123456" }),
  );
  assert.match(en.subject, /^123456\b/);
  assert.equal(en.subject.includes("123 456"), false);
  assert.match(en.text, /123456/);
  assert.match(en.html, /123456/);
  assert.equal(en.html.includes("123 456"), false);
  assert.match(en.html, /Okkey/);
  assert.match(en.html, /#f1f5f9/i);
  assert.match(en.html, /no-reply/i);
  assert.match(
    en.html,
    new RegExp(formatEmailMessage("en", "email.common.ignoreIfMistake", {}), "i"),
  );
  assert.ok(
    formatEmailMessage("en", "email.common.ignoreIfMistake", {}).endsWith("."),
    "EN ignoreIfMistake must end with a period",
  );
  assert.ok(
    formatEmailMessage("ru", "email.common.ignoreIfMistake", {}).endsWith("."),
    "RU ignoreIfMistake must end with a period",
  );
  assertNoMustachePlaceholders(en.text);

  const ru = await renderEmailTemplate("auth_email_code", "ru", {
    code: "654321",
    ttlSeconds: 60,
  });
  assert.equal(
    ru.subject,
    formatEmailMessage("ru", "email.auth.signInCode.subject", { code: "654321" }),
  );
  assert.match(ru.subject, /^654321\b/);
  assert.match(ru.text, /654321/);
  assert.match(ru.html, /654321/);
  assert.equal(ru.html.includes("654 321"), false);
  assert.match(ru.html, /no-reply/i);
  assert.match(ru.html, /проигнорируйте/i);
  assertNoMustachePlaceholders(ru.text);
});

test("renderEmailTemplate auth_email_code email_change purpose uses dedicated copy", async () => {
  const en = await renderEmailTemplate("auth_email_code", "en", {
    code: "146805",
    ttlSeconds: 120,
    purpose: "email_change",
  });
  assert.equal(
    en.subject,
    formatEmailMessage("en", "email.auth.emailChangeCode.subject", { code: "146805" }),
  );
  assert.match(en.subject, /^146805\b/);
  assert.match(en.subject, /email change/i);
  assert.equal(/sign-in/i.test(en.subject), false);
  assert.match(en.html, /email change/i);
  assert.equal(/sign-in/i.test(en.html), false);
  assert.match(en.html, /146805/);
  assert.equal(en.html.includes("146 805"), false);
  assertNoMustachePlaceholders(en.text);

  const ru = await renderEmailTemplate("auth_email_code", "ru", {
    code: "109836",
    ttlSeconds: 60,
    purpose: "email_change",
  });
  assert.equal(
    ru.subject,
    formatEmailMessage("ru", "email.auth.emailChangeCode.subject", { code: "109836" }),
  );
  assert.match(ru.subject, /^109836\b/);
  assert.match(ru.subject, /нового email/i);
  assert.equal(/код входа/i.test(ru.subject), false);
  assert.match(ru.html, /нового email/i);
  assert.equal(/код входа/i.test(ru.html), false);
  assert.match(ru.html, /109836/);
  assert.equal(ru.html.includes("109 836"), false);
  assertNoMustachePlaceholders(ru.text);
});

test("renderEmailTemplate device_approval_request en and ru", async () => {
  const en = await renderEmailTemplate("device_approval_request", "en", deviceVars);
  assert.match(en.subject, /device|approval/i);
  assert.match(en.text, /Mobile Android - App/);
  assert.match(en.text, /Mobile · App · Android/);
  assert.match(en.html, /Mobile Android - App/);
  assert.match(en.html, /Okkey/);
  assert.match(en.html, /#3B82F6/i);
  assertNoMustachePlaceholders(en.text);

  const ru = await renderEmailTemplate("device_approval_request", "ru", deviceVars);
  assert.equal(ru.subject, formatEmailMessage("ru", "email.device.approval.subject", {}));
  assert.match(ru.text, /Mobile Android - App/);
  assert.match(ru.text, /Mobile · App · Android/);
  assertNoMustachePlaceholders(ru.text);
});

test("renderEmailTemplate workspace_invite en and ru", async () => {
  const en = await renderEmailTemplate("workspace_invite", "en", workspaceVars);
  assert.match(en.subject, /Invitation|workspace/i);
  assert.match(en.html, /token-abc/);
  assert.match(en.html, /Sam/);
  assert.match(en.html, /#3B82F6/i);
  assertNoMustachePlaceholders(en.text);

  const ru = await renderEmailTemplate("workspace_invite", "ru", workspaceVars);
  assert.equal(
    ru.subject,
    formatEmailMessage("ru", "email.workspaceInvite.subject", { workspaceName: workspaceVars.workspaceName }),
  );
  assert.match(ru.html, /token-abc/);
  assertNoMustachePlaceholders(ru.text);
});

test("renderEmailTemplate two_factor_enabled en and ru", async () => {
  const en = await renderEmailTemplate("two_factor_enabled", "en", twoFactorVars);
  assert.match(en.subject, /two-factor|authentication/i);
  assert.match(en.text, /UTC/i);
  assert.equal(en.text.toLowerCase().includes("backup"), false);
  assert.equal(en.html.toLowerCase().includes("totp"), false);
  assertNoMustachePlaceholders(en.text);

  const ru = await renderEmailTemplate("two_factor_enabled", "ru", twoFactorVars);
  assert.equal(ru.subject, formatEmailMessage("ru", "email.twoFactor.enabled.subject", {}));
  assert.match(ru.text, /UTC/);
  assert.match(ru.html, /popup=settings\|twoFactor/);
  assert.match(ru.text, /popup=settings\|twoFactor/);
  assertNoMustachePlaceholders(ru.text);
});

test("renderEmailTemplate two_factor_backup_codes_regenerated en and ru", async () => {
  const en = await renderEmailTemplate(
    "two_factor_backup_codes_regenerated",
    "en",
    twoFactorVars,
  );
  assert.match(en.subject, /backup codes|regenerated/i);
  assert.match(en.text, /Previous codes|no longer valid/i);
  assertNoMustachePlaceholders(en.text);

  const ru = await renderEmailTemplate(
    "two_factor_backup_codes_regenerated",
    "ru",
    twoFactorVars,
  );
  assert.equal(ru.subject, formatEmailMessage("ru", "email.twoFactor.backupRegen.subject", {}));
  assert.ok(ru.text.includes(formatEmailMessage("ru", "email.twoFactor.backupRegen.line2", {})));
  assert.match(ru.html, /popup=settings\|twoFactor/);
  assertNoMustachePlaceholders(ru.text);
});

const accountEmailChangedVars = {
  newEmailMasked: "n***@example.com",
  occurredAtIso: "2026-01-01T12:00:00.000Z",
  securitySettingsUrl: "https://app.example/items?popup=settings|twoFactor",
} as const;

test("renderEmailTemplate account_email_changed en and ru", async () => {
  const en = await renderEmailTemplate("account_email_changed", "en", accountEmailChangedVars);
  assert.equal(
    en.subject,
    formatEmailMessage("en", "email.account.emailChanged.subject", {}),
  );
  assert.match(en.html, /n\*\*\*@example\.com/);
  assert.match(en.text, /n\*\*\*@example\.com/);
  assert.match(en.html, /no-reply/i);
  assert.match(
    en.html,
    new RegExp(formatEmailMessage("en", "email.common.ignoreIfMistake", {}), "i"),
  );
  assert.match(en.html, /popup=settings\|twoFactor/);
  assert.match(en.text, /popup=settings\|twoFactor/);
  assert.equal(en.html.includes("/settings/security"), false);
  assertNoMustachePlaceholders(en.text);

  const ru = await renderEmailTemplate("account_email_changed", "ru", accountEmailChangedVars);
  assert.equal(
    ru.subject,
    formatEmailMessage("ru", "email.account.emailChanged.subject", {}),
  );
  assert.match(ru.html, /n\*\*\*@example\.com/);
  assert.match(ru.html, /изменён/i);
  assert.match(ru.html, /проигнорируйте/i);
  assert.match(ru.html, /popup=settings\|twoFactor/);
  assertNoMustachePlaceholders(ru.text);
});

test("formatEmailMessage falls back to English when key exists only in en bundle", () => {
  assert.equal(formatEmailMessage("ru", "email.qa.fallbackProbeOnlyInEn", {}), "QA_FALLBACK_EN_ONLY");
});

test("renderEmailTemplate throws EMAIL_TEMPLATE_MISSING_VARIABLE when code missing", async () => {
  await assert.rejects(
    () =>
      renderEmailTemplate("auth_email_code", "en", {
        code: "",
        ttlSeconds: 60,
      }),
    (e: unknown) =>
      e instanceof EmailTemplateError && e.code === "EMAIL_TEMPLATE_MISSING_VARIABLE",
  );
});

test("two_factor_enabled template body contains no backup codes or totp secrets", async () => {
  const rendered = await renderEmailTemplate("two_factor_enabled", "en", {
    occurredAtIso: "2026-01-01T12:00:00.000Z",
    securitySettingsUrl: "https://app.example/items?popup=settings|twoFactor",
  });
  assert.equal(rendered.text.toLowerCase().includes("backup"), false);
  assert.equal(rendered.html.toLowerCase().includes("totp"), false);
  assert.match(rendered.html, /popup=settings\|twoFactor/);
});

test("resolveEmailLocaleForRecipient prefers user locale over Accept-Language", () => {
  assert.equal(
    resolveEmailLocaleForRecipient({
      userLocale: "ru",
      explicitLocale: "en",
      acceptLanguage: "en-US,en;q=0.9",
      instanceDefault: "en",
    }),
    "ru",
  );
});

test("resolveEmailLocaleForRecipient uses Accept-Language when user locale unset", () => {
  assert.equal(
    resolveEmailLocaleForRecipient({
      userLocale: null,
      explicitLocale: null,
      acceptLanguage: "ru-RU,en;q=0.8",
      instanceDefault: "en",
    }),
    "ru",
  );
});

test("parsePrimaryLocaleFromAcceptLanguage reads first supported tag", () => {
  assert.equal(parsePrimaryLocaleFromAcceptLanguage("ru-RU,en;q=0.8"), "ru");
  assert.equal(parsePrimaryLocaleFromAcceptLanguage("fr-FR,en;q=0.9"), "en");
});

test("normalizeSupportedLocaleTag maps BCP-47 base language only", () => {
  assert.equal(normalizeSupportedLocaleTag("RU-ru"), "ru");
  assert.equal(normalizeSupportedLocaleTag("EN-us"), "en");
  assert.equal(normalizeSupportedLocaleTag("de-DE"), null);
});

test("EmailTemplateService sendAuthEmailCode uses mock transport without leftover placeholders", async () => {
  const sent: Array<{ subject: string; text: string; html: string }> = [];
  const sender: EmailSender = {
    send: async (m) => {
      sent.push({ subject: m.subject, text: m.text, html: m.html });
    },
  };
  const svc = new EmailTemplateService(sender, {
    from: "x@y.z",
    defaultLocale: "en",
    publicAppBaseUrl: "",
  });
  await svc.sendAuthEmailCode({
    to: "u@example.com",
    localeHints: { explicitLocale: "en" },
    variables: { code: "111222", ttlSeconds: 300 },
  });
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /111222/);
  assert.equal(sent[0].text.includes("{{"), false);
});

test("EmailTemplateService sendDeviceApprovalRequest ru uses ru bundle subject", async () => {
  const sent: Array<{ subject: string; text: string }> = [];
  const sender: EmailSender = {
    send: async (m) => {
      sent.push({ subject: m.subject, text: m.text });
    },
  };
  const svc = new EmailTemplateService(sender, {
    from: "x@y.z",
    defaultLocale: "en",
    publicAppBaseUrl: "https://app.example",
  });
  await svc.sendDeviceApprovalRequest({
    to: "owner@example.com",
    localeHints: { explicitLocale: "ru" },
    variables: { ...deviceVars },
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, formatEmailMessage("ru", "email.device.approval.subject", {}));
  assert.equal(sent[0].text.includes("{{"), false);
});

test("EmailTemplateService workspace_invite renders invite link", async () => {
  const sent: Array<{ html: string }> = [];
  const sender: EmailSender = {
    send: async (m) => {
      sent.push({ html: m.html });
    },
  };
  const svc = new EmailTemplateService(sender, {
    from: "x@y.z",
    defaultLocale: "en",
    publicAppBaseUrl: createTestApiConfig().publicAppBaseUrl,
  });
  await svc.sendWorkspaceInvite({
    to: "invitee@example.com",
    localeHints: {},
    variables: {
      inviterDisplayName: "Alex",
      workspaceName: "Team",
      inviteUrl: "https://okkey.test/invite/abc",
    },
  });
  assert.match(sent[0].html, /invite\/abc/);
  assert.match(sent[0].html, /Alex/);
});

test("EmailTemplateService sendTwoFactorEnabled and sendTwoFactorBackupCodesRegenerated respect explicit ru locale", async () => {
  const sent: Array<{ subject: string }> = [];
  const sender: EmailSender = {
    send: async (m) => {
      sent.push({ subject: m.subject });
    },
  };
  const svc = new EmailTemplateService(sender, {
    from: "x@y.z",
    defaultLocale: "en",
    publicAppBaseUrl: "https://app.example",
  });
  await svc.sendTwoFactorEnabled({
    to: "u@example.com",
    localeHints: { explicitLocale: "ru" },
    variables: twoFactorVars,
  });
  await svc.sendTwoFactorBackupCodesRegenerated({
    to: "u@example.com",
    localeHints: { explicitLocale: "ru" },
    variables: twoFactorVars,
  });
  assert.equal(sent.length, 2);
  assert.equal(sent[0].subject, formatEmailMessage("ru", "email.twoFactor.enabled.subject", {}));
  assert.equal(sent[1].subject, formatEmailMessage("ru", "email.twoFactor.backupRegen.subject", {}));
});

test("EmailTemplateService device and contact recovery request emails render CTA url", async () => {
  const sent: Array<{ subject: string; text: string; html: string }> = [];
  const sender: EmailSender = {
    send: async (m) => {
      sent.push({ subject: m.subject, text: m.text, html: m.html });
    },
  };
  const svc = new EmailTemplateService(sender, {
    from: "x@y.z",
    defaultLocale: "en",
    publicAppBaseUrl: "https://app.example",
  });
  const deviceHelpUrl = "https://app.example/items?popup=settings|recovery";
  const contactHelpUrl = "https://app.example/items";
  await svc.sendDeviceRecoveryApprovalRequest({
    to: "owner@example.com",
    localeHints: { explicitLocale: "en" },
    variables: {
      helpUrl: deviceHelpUrl,
      requestedAtIso: "2026-09-18T10:00:00.000Z",
      expiresAtIso: "2026-09-18T11:00:00.000Z",
      deviceName: "Web Chrome",
      platform: "Web · Chrome",
      osName: "macOS",
      requestIp: "203.0.113.9",
      country: "Singapore",
      city: "Singapore",
    },
  });
  await svc.sendContactRecoveryReleaseRequest({
    to: "friend@example.com",
    localeHints: { explicitLocale: "ru" },
    variables: {
      helpUrl: contactHelpUrl,
      ownerEmail: "owner@example.com",
      requestedAtIso: "2026-09-18T10:00:00.000Z",
      expiresAtIso: "2026-09-18T11:00:00.000Z",
    },
  });
  assert.equal(sent.length, 2);
  assert.equal(sent[0].subject, formatEmailMessage("en", "email.device.recovery.subject", {}));
  assert.match(sent[0].html, /popup=settings\|recovery/);
  assert.match(sent[0].html, /Web Chrome/);
  assert.match(sent[0].text, /203\.0\.113\.9/);
  assert.equal(sent[0].text.includes("{{"), false);
  assert.equal(sent[1].subject, formatEmailMessage("ru", "email.contacts.recovery.subject", {}));
  assert.match(sent[1].text, /Аккаунт: owner@example.com/);
  assert.match(sent[1].text, /Запрос:/);
  assert.match(sent[1].text, /Истекает:/);
  assert.match(sent[1].html, /https:\/\/app\.example\/items/);
  assert.equal(sent[1].html.includes("popup=settings"), false);
  assert.equal(sent[1].text.includes("{{"), false);
});

test("EmailTemplateService sendTrustedContactInvite renders inviter details", async () => {
  const sent: Array<{ subject: string; text: string; html: string }> = [];
  const sender: EmailSender = {
    send: async (m) => {
      sent.push({ subject: m.subject, text: m.text, html: m.html });
    },
  };
  const svc = new EmailTemplateService(sender, {
    from: "x@y.z",
    defaultLocale: "en",
    publicAppBaseUrl: "https://app.example",
  });
  await svc.sendTrustedContactInvite({
    to: "friend@example.com",
    localeHints: { explicitLocale: "ru" },
    variables: {
      inviterDisplayName: "Alex Okkey",
      inviterEmail: "alex@example.com",
      helpUrl: "https://app.example/items?popup=settings|recovery",
    },
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].subject, formatEmailMessage("ru", "email.contacts.invite.subject", {}));
  assert.match(sent[0].text, /Alex Okkey/);
  assert.match(sent[0].text, /alex@example.com/);
  assert.match(sent[0].html, /popup=settings\|recovery/);
  assert.equal(sent[0].text.includes("{{"), false);
  // Footnotes must appear after the body separator (auth-code pattern).
  const ignore = formatEmailMessage("ru", "email.common.ignoreIfMistake", {});
  const ignoreIdx = sent[0].html.indexOf(ignore);
  const lastHr = sent[0].html.lastIndexOf("<hr");
  assert.ok(ignoreIdx > lastHr && lastHr > 0, "invite footnote must be below separator");
  assert.match(sent[0].html, /no-reply/i);
});

test("device approval footnotes render below EmailShell separator", async () => {
  const en = await renderEmailTemplate("device_approval_request", "en", deviceVars);
  const note = formatEmailMessage("en", "email.common.ignoreIfMistake", {});
  const noteIdx = en.html.indexOf(note);
  const lastHr = en.html.lastIndexOf("<hr");
  assert.ok(noteIdx > lastHr && lastHr > 0, "device approval footnote must be below separator");
  assert.match(en.html, /no-reply/i);
});

test("workspace invite and two-factor emails include shared no-reply footer", async () => {
  const invite = await renderEmailTemplate("workspace_invite", "en", workspaceVars);
  const twoFactor = await renderEmailTemplate("two_factor_enabled", "ru", twoFactorVars);
  const ignoreEn = formatEmailMessage("en", "email.common.ignoreIfMistake", {});
  const ignoreRu = formatEmailMessage("ru", "email.common.ignoreIfMistake", {});
  assert.ok(invite.html.includes(ignoreEn));
  assert.match(invite.html, /no-reply/i);
  assert.ok(twoFactor.html.includes(ignoreRu));
  assert.match(twoFactor.html, /no-reply/i);
});
