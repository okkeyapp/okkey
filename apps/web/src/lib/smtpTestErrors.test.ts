import { describe, expect, it } from "vitest";

import { smtpTestErrorKind, smtpTestErrorMessageKey } from "./smtpTestErrors";

describe("smtpTestErrorKind", () => {
  it("maps stable API codes and falls back to generic without using body.message", () => {
    expect(smtpTestErrorKind({ body: { error: "SMTP_TIMEOUT", message: "Connection timeout" } })).toBe(
      "timeout",
    );
    expect(smtpTestErrorKind({ body: { error: "SMTP_AUTH_FAILED", message: "535" } })).toBe("auth");
    expect(smtpTestErrorKind({ body: { error: "SMTP_CONNECTION_REFUSED" } })).toBe("connectionRefused");
    expect(smtpTestErrorKind({ body: { error: "SMTP_TLS_ERROR" } })).toBe("tls");
    expect(
      smtpTestErrorKind({ body: { error: "EMAIL_TRANSPORT_ERROR", message: "Connection timeout" } }),
    ).toBe("generic");
    expect(smtpTestErrorKind({ body: { message: "Connection timeout" } })).toBe("generic");
    expect(smtpTestErrorKind(new Error("Connection timeout"))).toBe("generic");
  });
});

describe("smtpTestErrorMessageKey", () => {
  it("returns i18n keys for each kind", () => {
    expect(smtpTestErrorMessageKey("timeout")).toBe("web.workspaceSettings.serverMail.testErrorTimeout");
    expect(smtpTestErrorMessageKey("auth")).toBe("web.workspaceSettings.serverMail.testErrorAuth");
    expect(smtpTestErrorMessageKey("connectionRefused")).toBe(
      "web.workspaceSettings.serverMail.testErrorConnectionRefused",
    );
    expect(smtpTestErrorMessageKey("tls")).toBe("web.workspaceSettings.serverMail.testErrorTls");
    expect(smtpTestErrorMessageKey("generic")).toBe("web.workspaceSettings.serverMail.testError");
  });
});
