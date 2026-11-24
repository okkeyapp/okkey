import assert from "node:assert/strict";
import test from "node:test";

import {
  applyEmailAppUrlLocale,
  buildEmailAppPathUrl,
  EmailTemplateService,
  type EmailSender,
} from "../src/email/service.ts";

test("buildEmailAppPathUrl percent-encodes popup pipe separator", () => {
  assert.equal(
    buildEmailAppPathUrl("https://app.example/", "/items?popup=settings|devices"),
    "https://app.example/items?popup=settings%7Cdevices",
  );
  assert.equal(
    buildEmailAppPathUrl("https://app.example", "items?popup=settings|twoFactor"),
    "https://app.example/items?popup=settings%7CtwoFactor",
  );
});

test("buildEmailAppPathUrl preserves path-prefix bases and empty base", () => {
  assert.equal(
    buildEmailAppPathUrl("https://app.example/app", "/items?popup=settings|recovery"),
    "https://app.example/app/items?popup=settings%7Crecovery",
  );
  assert.equal(buildEmailAppPathUrl("", "/items?popup=settings|devices"), "");
  assert.equal(buildEmailAppPathUrl("   ", "/items"), "");
});

test("buildEmailAppPathUrl attaches lng when locale is provided", () => {
  assert.equal(
    buildEmailAppPathUrl("https://app.example", "/items?popup=settings|devices", {
      locale: "ru",
    }),
    "https://app.example/items?popup=settings%7Cdevices&lng=ru",
  );
  assert.equal(
    buildEmailAppPathUrl("https://app.example", "/invite/token", { locale: "en" }),
    "https://app.example/invite/token?lng=en",
  );
});

test("applyEmailAppUrlLocale rewrites known app deep-link fields", () => {
  const out = applyEmailAppUrlLocale(
    {
      helpUrl: "https://app.example/items?popup=settings|devices",
      securitySettingsUrl: "https://app.example/items?popup=settings|twoFactor",
      inviteUrl: "https://app.example/invite/abc",
      other: "leave-me",
    },
    "https://app.example",
    "ru",
  );
  assert.equal(out.helpUrl, "https://app.example/items?popup=settings%7Cdevices&lng=ru");
  assert.equal(
    out.securitySettingsUrl,
    "https://app.example/items?popup=settings%7CtwoFactor&lng=ru",
  );
  assert.equal(out.inviteUrl, "https://app.example/invite/abc?lng=ru");
  assert.equal(out.other, "leave-me");
});

test("EmailTemplateService encodes helpUrl and attaches lng in rendered HTML", async () => {
  const sent: Array<{ html: string; text: string }> = [];
  const sender: EmailSender = {
    async send(message) {
      sent.push({ html: message.html, text: message.text });
    },
  };
  const svc = new EmailTemplateService(sender, {
    from: "noreply@example.com",
    defaultLocale: "en",
    publicAppBaseUrl: "https://app.example",
  });

  await svc.sendDeviceApprovalRequest({
    to: "user@example.com",
    localeHints: { userLocale: "ru" },
    variables: {
      deviceName: "Pixel",
      platform: "Web · Chrome",
      osName: "Android",
      requestIp: "203.0.113.9",
      country: null,
      city: null,
      helpUrl: "https://app.example/items?popup=settings|devices",
      requestedAtIso: "2026-01-15T10:00:00.000Z",
    },
  });

  assert.equal(sent.length, 1);
  assert.match(sent[0]!.html, /popup=settings%7Cdevices/);
  assert.match(sent[0]!.html, /lng=ru/);
  assert.equal(sent[0]!.html.includes("popup=settings|devices"), false);
  assert.match(sent[0]!.text, /popup=settings%7Cdevices/);
});
