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
  requestedAtIso: "2026-10-16T07:09:00.000Z",
  expiresAtIso: "2026-10-16T07:19:00.000Z",
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

function assertNoNulBytes(s: string): void {
  assert.equal(s.includes("\0"), false, "email body must not contain U+0000");
}

/** React Email Preview must sit inside <body>, not between </head> and <body>. */
function assertPreviewInsideBody(html: string, previewText: string): void {
  const bodyOpen = html.search(/<body\b/i);
  assert.ok(bodyOpen >= 0, "html must include <body>");
  const previewMarker = html.indexOf('data-skip-in-text="true"');
  assert.ok(previewMarker >= 0, "html must include Preview marker");
  assert.ok(
    previewMarker > bodyOpen,
    "Preview (preheader) must be inside <body>, not before it",
  );
  const previewSlice = html.slice(previewMarker, previewMarker + 400);
  assert.ok(
    previewSlice.includes(previewText),
    `preheader must include useful copy: ${previewText}`,
  );
}

/** Dual color-scheme + dark media styles on every shell-backed template. */
function assertEmailDarkModeSupport(html: string): void {
  assert.match(html, /<meta\s+name="color-scheme"\s+content="light dark"\s*\/?>/i);
  assert.match(html, /<meta\s+name="supported-color-schemes"\s+content="light dark"\s*\/?>/i);
  assert.match(html, /prefers-color-scheme:\s*dark/i);
  assert.match(html, /okkey-canvas/);
  assert.match(html, /okkey-card/);
  assert.match(html, /#0f172a/i);
  assert.match(html, /#1e293b/i);
  // react-email Body copies `style` onto an inner wrapper <td> without className.
  // That wrapper must not carry the light canvas fill (would frame the card in dark mode).
  // Preview may sit between <body> and the wrapper <table> (first child of Body).
  const bodyOpen = html.search(/<body\b[^>]*class="[^"]*\bokkey-canvas\b[^"]*"/i);
  assert.ok(bodyOpen >= 0, "body must carry okkey-canvas");
  const bodyWrapper = html.slice(bodyOpen).match(
    /<table\b[^>]*>\s*<tbody>\s*<tr>\s*<td\b([^>]*)>/i,
  );
  assert.ok(bodyWrapper, "expected react-email Body wrapper <td>");
  assert.equal(
    /#f1f5f9/i.test(bodyWrapper[1] ?? ""),
    false,
    "Body wrapper <td> must not inline light canvas background",
  );
  // Every td that still carries the light canvas fill must also have okkey-canvas.
  for (const match of html.matchAll(/<td\b([^>]*)>/gi)) {
    const attrs = match[1] ?? "";
    if (!/#f1f5f9/i.test(attrs)) continue;
    assert.match(
      attrs,
      /class=(["'])[^"']*\bokkey-canvas\b[^"']*\1/i,
      `canvas-colored <td> must include okkey-canvas; got: <td${attrs}>`,
    );
  }
}

/** Shared two-line footer required on every transactional template. */
function assertSharedEmailFooter(
  locale: "en" | "ru",
  rendered: { html: string; text: string },
): void {
  const noReply = formatEmailMessage(locale, "email.common.noReply", {});
  const ignore = formatEmailMessage(locale, "email.common.ignoreIfMistake", {});
  assert.ok(rendered.text.includes(noReply), `${locale} plain must include noReply`);
  assert.ok(rendered.text.includes(ignore), `${locale} plain must include ignoreIfMistake`);
  // HTML may encode apostrophes; match stable fragments.
  if (locale === "en") {
    assert.match(rendered.html, /sent automatically/i);
    assert.match(rendered.html, /safely ignore it/i);
  } else {
    assert.match(rendered.html, /отправлено автоматически/i);
    assert.match(rendered.html, /проигнорируйте/i);
  }
  assert.ok(noReply.endsWith("."), `${locale} noReply must end with a period`);
  assert.ok(ignore.endsWith("."), `${locale} ignoreIfMistake must end with a period`);
}

/** `<html lang>`, document title, viewport, and color-scheme on every template. */
function assertHtmlDocumentMeta(
  locale: "en" | "ru",
  rendered: { subject: string; html: string },
): void {
  assert.match(rendered.html, new RegExp(`lang="${locale}"`));
  assert.match(rendered.html, /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1\.0"\s*\/?>/i);
  assert.match(rendered.html, /<meta\s+name="color-scheme"\s+content="light dark"\s*\/?>/i);
  const titleMatch = rendered.html.match(/<title>([^<]*)<\/title>/i);
  assert.ok(titleMatch, `${locale} html must include <title>`);
  const decodedTitle = titleMatch[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
  assert.equal(decodedTitle, rendered.subject, `${locale} <title> must match subject`);
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
  assertHtmlDocumentMeta("en", en);
  assert.match(en.html, /cid:okkey-mark/);
  assert.equal(en.html.includes("data:image"), false);
  assert.match(en.html, /#f1f5f9/i);
  assertEmailDarkModeSupport(en.html);
  assert.match(en.text, /^Okkey\b/m);
  const enPreview = formatEmailMessage("en", "email.auth.signInCode.preview", { minutes: 2 });
  assert.equal(enPreview, "Valid for 2 minutes. Never share this code.");
  assertPreviewInsideBody(en.html, enPreview);
  assert.equal(
    en.html.includes("Your Okkey verification code is:"),
    true,
    "body lead still uses beforeCode",
  );
  assert.equal(
    en.html.indexOf(enPreview) < en.html.indexOf("Your Okkey verification code is:"),
    true,
  );
  assert.equal(en.text.includes(enPreview), false, "plain text must not include preheader");
  assertSharedEmailFooter("en", en);
  assert.equal(
    en.text.includes("If you didn't request this code"),
    false,
    "OTP must not use a per-template ignore variant",
  );
  assertNoMustachePlaceholders(en.text);
  assertNoNulBytes(en.html);
  assertNoNulBytes(en.text);

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
  assertHtmlDocumentMeta("ru", ru);
  assertEmailDarkModeSupport(ru.html);
  assert.match(ru.text, /^Okkey\b/m);
  const ruPreview = formatEmailMessage("ru", "email.auth.signInCode.preview", { minutes: 1 });
  assert.equal(ruPreview, "Код действует 1 минуту. Никому его не сообщайте.");
  assertPreviewInsideBody(ru.html, ruPreview);
  assert.equal(ru.text.includes(ruPreview), false, "plain text must not include preheader");
  assertSharedEmailFooter("ru", ru);
  assert.equal(ru.text.includes("Если вы не запрашивали код"), false);
  assertNoMustachePlaceholders(ru.text);
  assertNoNulBytes(ru.html);
  assertNoNulBytes(ru.text);
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
  assertPreviewInsideBody(
    en.html,
    formatEmailMessage("en", "email.auth.emailChangeCode.preview", { minutes: 2 }),
  );
  assertSharedEmailFooter("en", en);
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
  assertPreviewInsideBody(
    ru.html,
    formatEmailMessage("ru", "email.auth.emailChangeCode.preview", { minutes: 1 }),
  );
  assertNoMustachePlaceholders(ru.text);
});

test("renderEmailTemplate device_approval_request en and ru", async () => {
  const en = await renderEmailTemplate("device_approval_request", "en", deviceVars);
  assert.match(en.subject, /device|approval/i);
  // Single device line (no Device/Platform duplicate).
  assert.match(en.text, /Mobile · App · Android/);
  assert.equal(en.text.includes("Mobile Android - App"), false);
  assert.match(en.text, /Oct 16, 2026, 7:09 AM UTC/);
  assert.match(en.text, /Oct 16, 2026, 7:19 AM UTC/);
  assert.match(en.text, /Settings → Devices/);
  assert.match(en.html, /Mobile · App · Android/);
  assert.match(en.html, /Okkey/);
  assert.match(en.html, /#2563EB/i);
  assert.match(en.html, /Oct 16, 2026, 7:09 AM UTC/);
  assertPreviewInsideBody(en.html, formatEmailMessage("en", "email.device.approval.lead", {}));
  assertSharedEmailFooter("en", en);
  assertNoMustachePlaceholders(en.text);

  const ru = await renderEmailTemplate("device_approval_request", "ru", deviceVars);
  assert.equal(ru.subject, formatEmailMessage("ru", "email.device.approval.subject", {}));
  assert.match(ru.text, /Mobile · App · Android/);
  assert.match(ru.text, /07:09 UTC/);
  assert.match(ru.text, /Настройки → Устройства/);
  assert.equal(ru.text.includes("UTC UTC"), false);
  assertSharedEmailFooter("ru", ru);
  assertNoMustachePlaceholders(ru.text);

  const noGeo = await renderEmailTemplate("device_approval_request", "en", {
    ...deviceVars,
    city: null,
    country: null,
  });
  assert.match(noGeo.text, /Location: not determined/);
});

test("renderEmailTemplate workspace_invite en and ru", async () => {
  const en = await renderEmailTemplate("workspace_invite", "en", workspaceVars);
  assert.match(en.subject, /Invitation|workspace/i);
  assert.match(en.html, /token-abc/);
  assert.match(en.html, /Sam/);
  assert.match(en.html, /#2563EB/i);
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
  assert.match(en.text, /Jan 1, 2026, 12:00 PM UTC/);
  assert.equal(en.text.includes("UTC UTC"), false);
  assert.equal(en.text.toLowerCase().includes("backup"), false);
  assert.equal(en.html.toLowerCase().includes("totp"), false);
  assertNoMustachePlaceholders(en.text);
  assertNoNulBytes(en.html);
  assertNoNulBytes(en.text);

  const ru = await renderEmailTemplate("two_factor_enabled", "ru", twoFactorVars);
  assert.equal(ru.subject, formatEmailMessage("ru", "email.twoFactor.enabled.subject", {}));
  assert.match(ru.text, /12:00 UTC/);
  assert.equal(ru.text.includes("UTC UTC"), false);
  assert.match(ru.html, /popup=settings\|twoFactor/);
  assert.match(ru.text, /popup=settings\|twoFactor/);
  assertNoMustachePlaceholders(ru.text);
  assertNoNulBytes(ru.html);
  assertNoNulBytes(ru.text);
});

test("renderEmailTemplate two_factor_disabled en and ru", async () => {
  const en = await renderEmailTemplate("two_factor_disabled", "en", twoFactorVars);
  assert.match(en.subject, /two-factor|authentication/i);
  assert.match(en.subject, /disabled/i);
  assert.match(en.text, /Jan 1, 2026, 12:00 PM UTC/);
  assert.equal(en.text.includes("UTC UTC"), false);
  assert.match(en.text, /re-enable|authenticator/i);
  assert.equal(en.html.toLowerCase().includes("totp"), false);
  assertNoMustachePlaceholders(en.text);

  const ru = await renderEmailTemplate("two_factor_disabled", "ru", twoFactorVars);
  assert.equal(ru.subject, formatEmailMessage("ru", "email.twoFactor.disabled.subject", {}));
  assert.match(ru.text, /12:00 UTC/);
  assert.equal(ru.text.includes("UTC UTC"), false);
  assert.match(ru.html, /popup=settings\|twoFactor/);
  assert.match(ru.text, /popup=settings\|twoFactor/);
  assertSharedEmailFooter("ru", ru);
  assert.match(ru.html, /администратору/);
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
  assert.match(en.text, /Jan 1, 2026, 12:00 PM UTC/);
  assert.equal(en.text.includes("UTC UTC"), false);
  assertNoMustachePlaceholders(en.text);
  assertNoNulBytes(en.html);
  assertNoNulBytes(en.text);

  const ru = await renderEmailTemplate(
    "two_factor_backup_codes_regenerated",
    "ru",
    twoFactorVars,
  );
  assert.equal(ru.subject, formatEmailMessage("ru", "email.twoFactor.backupRegen.subject", {}));
  assert.ok(ru.text.includes(formatEmailMessage("ru", "email.twoFactor.backupRegen.line2", {})));
  assert.match(ru.text, /12:00 UTC/);
  assert.equal(ru.text.includes("UTC UTC"), false);
  assert.match(ru.html, /popup=settings\|twoFactor/);
  assertNoMustachePlaceholders(ru.text);
  assertNoNulBytes(ru.html);
  assertNoNulBytes(ru.text);
});

test("rendered email HTML and plain text have no NUL bytes", async () => {
  // React 18 streaming SSR (`renderToPipeableStream`) can emit raw U+0000 at
  // content-length-sensitive offsets in HTML and plain text (incl. mid-word RU CTAs).
  // Templates render via `renderToStaticMarkup` to avoid that path.
  const lengthSensitiveTwoFactor = {
    ...twoFactorVars,
    occurredAtIso: "2026-01-10T00:00:00.000Z",
  } as const;
  const samples = await Promise.all([
    renderEmailTemplate("two_factor_enabled", "en", lengthSensitiveTwoFactor),
    renderEmailTemplate("two_factor_enabled", "ru", lengthSensitiveTwoFactor),
    renderEmailTemplate("two_factor_backup_codes_regenerated", "en", lengthSensitiveTwoFactor),
    renderEmailTemplate("two_factor_backup_codes_regenerated", "ru", lengthSensitiveTwoFactor),
    renderEmailTemplate("two_factor_disabled", "ru", lengthSensitiveTwoFactor),
    renderEmailTemplate("auth_email_code", "en", { code: "123456", ttlSeconds: 120 }),
    renderEmailTemplate("auth_email_code", "ru", { code: "123456", ttlSeconds: 120 }),
    renderEmailTemplate("device_approval_request", "en", deviceVars),
    renderEmailTemplate("device_approval_request", "ru", deviceVars),
  ]);
  for (const rendered of samples) {
    assertNoNulBytes(rendered.html);
    assertNoNulBytes(rendered.text);
    assert.match(rendered.html, /data-skip-in-text/);
  }
  const ruEnabled = samples[1];
  assert.match(ruEnabled.html, /безопасности/);
  assert.match(ruEnabled.text, /безопасности/);
  assert.equal(ruEnabled.html.includes("безопасно\0сти"), false);
  assert.equal(ruEnabled.text.includes("безопасно\0сти"), false);
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
  assert.match(en.text, /Jan 1, 2026, 12:00 PM UTC/);
  assert.equal(en.text.includes("UTC UTC"), false);
  assertSharedEmailFooter("en", en);
  assert.match(en.text, /contact your administrator/i);
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
  assert.match(ru.text, /12:00 UTC/);
  assert.equal(ru.text.includes("UTC UTC"), false);
  assertSharedEmailFooter("ru", ru);
  assert.match(ru.html, /администратору/);
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

test("EmailTemplateService sendTwoFactorEnabled/disabled/backupRegen respect explicit ru locale", async () => {
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
  await svc.sendTwoFactorDisabled({
    to: "u@example.com",
    localeHints: { explicitLocale: "ru" },
    variables: twoFactorVars,
  });
  await svc.sendTwoFactorBackupCodesRegenerated({
    to: "u@example.com",
    localeHints: { explicitLocale: "ru" },
    variables: twoFactorVars,
  });
  assert.equal(sent.length, 3);
  assert.equal(sent[0].subject, formatEmailMessage("ru", "email.twoFactor.enabled.subject", {}));
  assert.equal(sent[1].subject, formatEmailMessage("ru", "email.twoFactor.disabled.subject", {}));
  assert.equal(sent[2].subject, formatEmailMessage("ru", "email.twoFactor.backupRegen.subject", {}));
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
  assert.match(sent[0].html, /Web · Chrome · macOS/);
  assert.match(sent[0].html, /Settings → Recovery/);
  assertSharedEmailFooter("en", sent[0]);
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
  assertSharedEmailFooter("ru", sent[0]);
});

test("device approval warning renders in body above EmailShell footer separator", async () => {
  const en = await renderEmailTemplate("device_approval_request", "en", deviceVars);
  const block = formatEmailMessage("en", "email.device.approval.noteBlockIfNotYou", {});
  const blockIdx = en.html.indexOf(block);
  const lastHr = en.html.lastIndexOf("<hr");
  assert.ok(
    blockIdx > 0 && lastHr > blockIdx,
    "device approval warning must be above footer separator",
  );
  assert.ok(en.text.includes(block), "plain must keep the body warning");
  const noReply = formatEmailMessage("en", "email.common.noReply", {});
  assert.ok(
    en.text.indexOf(block) < en.text.indexOf(noReply),
    "plain warning must sit above the shared footer",
  );
  assertSharedEmailFooter("en", en);
});

test("all templates share the same two-line footer", async () => {
  const invite = await renderEmailTemplate("workspace_invite", "en", workspaceVars);
  const twoFactor = await renderEmailTemplate("two_factor_enabled", "ru", twoFactorVars);
  const twoFactorDisabled = await renderEmailTemplate("two_factor_disabled", "en", twoFactorVars);
  const otp = await renderEmailTemplate("auth_email_code", "en", {
    code: "111222",
    ttlSeconds: 120,
  });
  assertSharedEmailFooter("en", invite);
  assertSharedEmailFooter("ru", twoFactor);
  assertSharedEmailFooter("en", twoFactorDisabled);
  assertSharedEmailFooter("en", otp);
  assertHtmlDocumentMeta("en", invite);
  assertHtmlDocumentMeta("ru", twoFactor);
  assertHtmlDocumentMeta("en", twoFactorDisabled);
  assertHtmlDocumentMeta("en", otp);
  assertPreviewInsideBody(invite.html, formatEmailMessage("en", "email.workspaceInvite.intro", {
    inviter: workspaceVars.inviterDisplayName,
    workspaceName: workspaceVars.workspaceName,
  }));
  assertPreviewInsideBody(
    otp.html,
    formatEmailMessage("en", "email.auth.signInCode.preview", { minutes: 2 }),
  );
});

test("plan_change_request uses EmailShell and shared footer", async () => {
  const vars = {
    workspaceId: "ws_1",
    workspaceName: "Acme",
    workspaceUrl: "https://app.example",
    currentPlanTier: "FREE",
    requestedPlanTier: "ENTERPRISE",
    contactEmail: "sales-reply@example.com",
    accountEmail: "owner@example.com",
    locale: "en",
    region: "eu",
    workspaceMemberCount: 3,
    deploymentMode: "self-hosted",
    actorUserId: "u_1",
  } as const;
  const en = await renderEmailTemplate("plan_change_request", "en", vars);
  assert.match(en.subject, /License request/i);
  assert.match(en.html, /cid:okkey-mark/);
  assert.match(en.html, /#f1f5f9/i);
  assertHtmlDocumentMeta("en", en);
  assertEmailDarkModeSupport(en.html);
  assert.match(en.text, /^Okkey\b/m);
  assertSharedEmailFooter("en", en);
  assert.match(en.text, /Requested plan: ENTERPRISE/);
  const ru = await renderEmailTemplate("plan_change_request", "ru", {
    ...vars,
    locale: "ru",
  });
  assertHtmlDocumentMeta("ru", ru);
  assertEmailDarkModeSupport(ru.html);
  assert.match(ru.text, /^Okkey\b/m);
  assertSharedEmailFooter("ru", ru);
});

test("RU email copy uses consistent typography and lowercase вы", async () => {
  const blockNote = formatEmailMessage("ru", "email.device.approval.noteBlockIfNotYou", {});
  const ignoreMistake = formatEmailMessage("ru", "email.common.ignoreIfMistake", {});
  const noReply = formatEmailMessage("ru", "email.common.noReply", {});
  const backupLine2 = formatEmailMessage("ru", "email.twoFactor.backupRegen.line2", {});
  const recoveryBlock = formatEmailMessage("ru", "email.device.recovery.noteBlockIfNotYou", {});

  assert.ok(blockNote.endsWith("."), "device approval RU block note must end with a period");
  assert.ok(blockNote.includes(" вы "), "device approval should address with lowercase вы");
  assert.equal(blockNote.includes("Вы"), false, "device approval must not capitalize Вы");
  assert.equal(blockNote.includes("Вам"), false);

  assert.ok(ignoreMistake.includes(" вы "), "shared footer should address with lowercase вы");
  assert.equal(ignoreMistake.includes(" - "), false, "shared footer must not use hyphen as a dash");
  assert.ok(
    ignoreMistake.includes("—") || ignoreMistake.includes(","),
    "prefer em dash or comma over hyphen",
  );
  assert.ok(noReply.includes("автоматически"));
  assert.ok(recoveryBlock.includes("не подтверждайте"));

  assert.equal(backupLine2.includes("ответе приложения"), false);
  assert.ok(backupLine2.includes("в приложении"));
  assert.ok(backupLine2.includes("показываются"), "backup RU should say codes are shown in the app");
  assert.ok(backupLine2.includes("—"), "backup RU should use an em dash");

  const ru = await renderEmailTemplate("device_approval_request", "ru", deviceVars);
  assert.ok(ru.text.includes(blockNote));
  assert.ok(ru.text.includes(ignoreMistake));
  assert.ok(ru.text.includes(noReply));
  assert.equal(ru.text.includes("Вы "), false);
  assert.equal(ru.text.includes("Вам "), false);
  assert.equal(ru.text.includes(" по ошибке - "), false);

  const backup = await renderEmailTemplate(
    "two_factor_backup_codes_regenerated",
    "ru",
    twoFactorVars,
  );
  assert.ok(backup.text.includes(backupLine2));
  assert.equal(backup.text.includes("ответе приложения"), false);
  assert.ok(backup.text.includes(ignoreMistake));
});
