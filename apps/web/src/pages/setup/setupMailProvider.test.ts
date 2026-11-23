import { describe, expect, it } from "vitest";

import { applySetupMailProvider, type SetupMailProviderTemplate } from "./setupMailProvider";

const providers: SetupMailProviderTemplate[] = [
  { id: "custom", smtp_host: "", smtp_port: 587, smtp_tls_mode: "starttls", username_hint: null },
  {
    id: "gmail",
    smtp_host: "smtp.gmail.com",
    smtp_port: 587,
    smtp_tls_mode: "starttls",
    username_hint: "you@gmail.com",
  },
  {
    id: "postmark",
    smtp_host: "smtp.postmarkapp.com",
    smtp_port: 587,
    smtp_tls_mode: "starttls",
    username_hint: null,
  },
  {
    id: "sendgrid",
    smtp_host: "smtp.sendgrid.net",
    smtp_port: 587,
    smtp_tls_mode: "starttls",
    username_hint: "apikey",
  },
];

describe("applySetupMailProvider", () => {
  it("sets host/port/tls from the template but keeps username hints as placeholders only", () => {
    const next = applySetupMailProvider(
      {
        providerId: "custom",
        smtpHost: "",
        smtpPort: "587",
        smtpTlsMode: "starttls",
        smtpUsername: "",
        usernamePlaceholder: "",
      },
      "gmail",
      providers,
    );
    expect(next.smtpHost).toBe("smtp.gmail.com");
    expect(next.smtpPort).toBe("587");
    expect(next.smtpTlsMode).toBe("starttls");
    expect(next.smtpUsername).toBe("");
    expect(next.usernamePlaceholder).toBe("you@gmail.com");
  });

  it("clears a previous template hint value when switching providers", () => {
    const afterGmail = applySetupMailProvider(
      {
        providerId: "custom",
        smtpHost: "",
        smtpPort: "587",
        smtpTlsMode: "starttls",
        smtpUsername: "",
        usernamePlaceholder: "",
      },
      "gmail",
      providers,
    );
    // Simulate the old bug: hint was written into the value somehow, or user left it.
    const withHintAsValue = { ...afterGmail, smtpUsername: "you@gmail.com" };
    const afterPostmark = applySetupMailProvider(withHintAsValue, "postmark", providers);
    expect(afterPostmark.smtpUsername).toBe("");
    expect(afterPostmark.usernamePlaceholder).toBe("");
    expect(afterPostmark.smtpHost).toBe("smtp.postmarkapp.com");
  });

  it("preserves a user-entered username that is not the previous hint", () => {
    const afterGmail = applySetupMailProvider(
      {
        providerId: "custom",
        smtpHost: "",
        smtpPort: "587",
        smtpTlsMode: "starttls",
        smtpUsername: "",
        usernamePlaceholder: "",
      },
      "gmail",
      providers,
    );
    const typed = { ...afterGmail, smtpUsername: "real@gmail.com" };
    const afterSendgrid = applySetupMailProvider(typed, "sendgrid", providers);
    expect(afterSendgrid.smtpUsername).toBe("real@gmail.com");
    expect(afterSendgrid.usernamePlaceholder).toBe("apikey");
  });
});
