import test from "node:test";
import assert from "node:assert/strict";
import {
  EmailTemplateError,
  formatEmailFailureReason,
  sanitizeEmailSubjectForLogs,
  toPublicEmailErrorResponse,
} from "../src/email/errors.ts";

test("sanitizeEmailSubjectForLogs redacts leading verification code only", () => {
  assert.equal(
    sanitizeEmailSubjectForLogs("123456 is your Okkey sign-in code"),
    "****** is your Okkey sign-in code",
  );
  assert.equal(
    sanitizeEmailSubjectForLogs("654321 — код подтверждения нового email в Okkey"),
    "****** — код подтверждения нового email в Okkey",
  );
  assert.equal(sanitizeEmailSubjectForLogs("Invitation to workspace"), "Invitation to workspace");
  assert.equal(
    sanitizeEmailSubjectForLogs("Plan request Pro — Workspace42"),
    "Plan request Pro — Workspace42",
  );
  assert.equal(
    sanitizeEmailSubjectForLogs("Заявка на тариф Team — Офис 123"),
    "Заявка на тариф Team — Офис 123",
  );
});

test("toPublicEmailErrorResponse strips transport cause from client payload", () => {
  const error = new EmailTemplateError("EMAIL_SEND_FAILED", "smtp send failed", {
    cause: "connect ECONNREFUSED 127.0.0.1:4019",
  });
  const publicError = toPublicEmailErrorResponse(error);
  assert.equal(publicError.error, "EMAIL_SEND_FAILED");
  assert.equal(publicError.message, "email send failed");
  assert.equal(JSON.stringify(publicError).includes("ECONNREFUSED"), false);
});

test("toPublicEmailErrorResponse remaps EMAIL_TRANSPORT_ERROR", () => {
  const error = new EmailTemplateError("EMAIL_TRANSPORT_ERROR", "smtp send failed", {
    cause: "connect ECONNREFUSED 127.0.0.1:4019",
  });
  const publicError = toPublicEmailErrorResponse(error);
  assert.equal(publicError.error, "EMAIL_SEND_FAILED");
  assert.equal(publicError.message, "email send failed");
});

test("toPublicEmailErrorResponse keeps template error message", () => {
  const error = new EmailTemplateError(
    "EMAIL_TEMPLATE_MISSING_VARIABLE",
    "missing variable code",
    { variable: "code" },
  );
  const publicError = toPublicEmailErrorResponse(error);
  assert.equal(publicError.error, "EMAIL_TEMPLATE_MISSING_VARIABLE");
  assert.equal(publicError.message, "missing variable code");
});

test("formatEmailFailureReason appends details.cause for dead-letter/logs", () => {
  const error = new EmailTemplateError("EMAIL_TRANSPORT_ERROR", "smtp send failed", {
    cause: "connect ECONNREFUSED 127.0.0.1:4019",
  });
  assert.equal(
    formatEmailFailureReason(error),
    "smtp send failed: connect ECONNREFUSED 127.0.0.1:4019",
  );
});

test("formatEmailFailureReason falls back to Error.message", () => {
  assert.equal(formatEmailFailureReason(new Error("plain failure")), "plain failure");
});
