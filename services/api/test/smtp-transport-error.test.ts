import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySmtpTransportError,
  smtpTestErrorSafeMessage,
} from "../src/mail-settings/smtp-transport-error.ts";

test("classifySmtpTransportError maps timeout / auth / refused / tls / generic", () => {
  assert.equal(classifySmtpTransportError("Connection timeout"), "SMTP_TIMEOUT");
  assert.equal(classifySmtpTransportError("SMTP connection timed out after 30s"), "SMTP_TIMEOUT");
  assert.equal(classifySmtpTransportError("Error: ETIMEDOUT"), "SMTP_TIMEOUT");
  assert.equal(classifySmtpTransportError("Invalid login: 535 Authentication failed"), "SMTP_AUTH_FAILED");
  assert.equal(classifySmtpTransportError("Error: connect ECONNREFUSED 127.0.0.1:587"), "SMTP_CONNECTION_REFUSED");
  assert.equal(
    classifySmtpTransportError("1408A:error:0A00010B:SSL routines:wrong version number"),
    "SMTP_TLS_ERROR",
  );
  assert.equal(classifySmtpTransportError("something else went wrong"), "EMAIL_TRANSPORT_ERROR");
});

test("smtpTestErrorSafeMessage never echoes the raw cause", () => {
  assert.equal(smtpTestErrorSafeMessage("SMTP_TIMEOUT"), "smtp connection timed out");
  assert.ok(!smtpTestErrorSafeMessage("EMAIL_TRANSPORT_ERROR").includes("password"));
});
