import assert from "node:assert/strict";
import test from "node:test";

import { SMTP_PROVIDER_TEMPLATES } from "../src/setup/smtp-providers.ts";

/** 465 = implicit TLS; submission / classic ports use STARTTLS. */
function expectedTlsMode(port: number): "tls" | "starttls" {
  if (port === 465) {
    return "tls";
  }
  if (port === 587 || port === 25 || port === 2525) {
    return "starttls";
  }
  throw new Error(`unexpected smtp port in provider template: ${port}`);
}

test("each SMTP provider template pairs port with a consistent TLS mode", () => {
  assert.ok(SMTP_PROVIDER_TEMPLATES.length > 0);
  for (const template of SMTP_PROVIDER_TEMPLATES) {
    assert.equal(
      template.smtpTlsMode,
      expectedTlsMode(template.smtpPort),
      `${template.id}: port ${template.smtpPort} must use ${expectedTlsMode(template.smtpPort)}`,
    );
  }
});

test("Postmark uses 587 + STARTTLS (not implicit TLS)", () => {
  const postmark = SMTP_PROVIDER_TEMPLATES.find((t) => t.id === "postmark");
  assert.ok(postmark);
  assert.equal(postmark.smtpPort, 587);
  assert.equal(postmark.smtpTlsMode, "starttls");
});

test("SendGrid exposes fixed default username apikey (not a placeholder hint)", () => {
  const sendgrid = SMTP_PROVIDER_TEMPLATES.find((t) => t.id === "sendgrid");
  assert.ok(sendgrid);
  assert.equal(sendgrid.defaultUsername, "apikey");
  assert.equal(sendgrid.usernameHint, undefined);
});

test("example username hints are not fixed defaults", () => {
  const gmail = SMTP_PROVIDER_TEMPLATES.find((t) => t.id === "gmail");
  assert.ok(gmail);
  assert.equal(gmail.usernameHint, "you@gmail.com");
  assert.equal(gmail.defaultUsername, undefined);
});
