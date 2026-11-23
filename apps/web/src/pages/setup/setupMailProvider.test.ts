import { describe, expect, it } from "vitest";

import { applySetupMailProvider, type SetupMailProviderTemplate } from "./setupMailProvider";

const providers: SetupMailProviderTemplate[] = [
  {
    id: "custom",
    smtp_host: "",
    smtp_port: 587,
    smtp_tls_mode: "starttls",
    username_hint: null,
    default_username: null,
  },
  {
    id: "gmail",
    smtp_host: "smtp.gmail.com",
    smtp_port: 587,
    smtp_tls_mode: "starttls",
    username_hint: "you@gmail.com",
    default_username: null,
  },
  {
    id: "postmark",
    smtp_host: "smtp.postmarkapp.com",
    smtp_port: 587,
    smtp_tls_mode: "starttls",
    username_hint: null,
    default_username: null,
  },
  {
    id: "sendgrid",
    smtp_host: "smtp.sendgrid.net",
    smtp_port: 587,
    smtp_tls_mode: "starttls",
    username_hint: null,
    default_username: "apikey",
  },
];

const emptyCustom = {
  providerId: "custom",
  smtpHost: "",
  smtpPort: "587",
  smtpTlsMode: "starttls" as const,
  smtpUsername: "",
  usernamePlaceholder: "",
};

describe("applySetupMailProvider", () => {
  it("sets host/port/tls from the template but keeps username hints as placeholders only", () => {
    const next = applySetupMailProvider(emptyCustom, "gmail", providers);
    expect(next.smtpHost).toBe("smtp.gmail.com");
    expect(next.smtpPort).toBe("587");
    expect(next.smtpTlsMode).toBe("starttls");
    expect(next.smtpUsername).toBe("");
    expect(next.usernamePlaceholder).toBe("you@gmail.com");
  });

  it("prefills SendGrid default username as a real value, not a placeholder", () => {
    const next = applySetupMailProvider(emptyCustom, "sendgrid", providers);
    expect(next.smtpHost).toBe("smtp.sendgrid.net");
    expect(next.smtpUsername).toBe("apikey");
    expect(next.usernamePlaceholder).toBe("");
  });

  it("clears an unedited SendGrid apikey when switching away", () => {
    const afterSendgrid = applySetupMailProvider(emptyCustom, "sendgrid", providers);
    expect(afterSendgrid.smtpUsername).toBe("apikey");
    const afterPostmark = applySetupMailProvider(afterSendgrid, "postmark", providers);
    expect(afterPostmark.smtpUsername).toBe("");
    expect(afterPostmark.usernamePlaceholder).toBe("");
    expect(afterPostmark.smtpHost).toBe("smtp.postmarkapp.com");
  });

  it("prefills SendGrid apikey again when switching back with an empty username", () => {
    const afterSendgrid = applySetupMailProvider(emptyCustom, "sendgrid", providers);
    const afterGmail = applySetupMailProvider(afterSendgrid, "gmail", providers);
    expect(afterGmail.smtpUsername).toBe("");
    const backToSendgrid = applySetupMailProvider(afterGmail, "sendgrid", providers);
    expect(backToSendgrid.smtpUsername).toBe("apikey");
    expect(backToSendgrid.usernamePlaceholder).toBe("");
  });

  it("preserves a user-edited username when leaving SendGrid", () => {
    const afterSendgrid = applySetupMailProvider(emptyCustom, "sendgrid", providers);
    const edited = { ...afterSendgrid, smtpUsername: "custom-user" };
    const afterGmail = applySetupMailProvider(edited, "gmail", providers);
    expect(afterGmail.smtpUsername).toBe("custom-user");
    expect(afterGmail.usernamePlaceholder).toBe("you@gmail.com");
  });

  it("clears a previous template hint value when switching providers", () => {
    const afterGmail = applySetupMailProvider(emptyCustom, "gmail", providers);
    // Simulate leftover hint-as-value (legacy) or coincidence with the example.
    const withHintAsValue = { ...afterGmail, smtpUsername: "you@gmail.com" };
    const afterPostmark = applySetupMailProvider(withHintAsValue, "postmark", providers);
    expect(afterPostmark.smtpUsername).toBe("");
    expect(afterPostmark.usernamePlaceholder).toBe("");
    expect(afterPostmark.smtpHost).toBe("smtp.postmarkapp.com");
  });

  it("preserves a user-entered username that is not the previous hint or default", () => {
    const afterGmail = applySetupMailProvider(emptyCustom, "gmail", providers);
    const typed = { ...afterGmail, smtpUsername: "real@gmail.com" };
    const afterSendgrid = applySetupMailProvider(typed, "sendgrid", providers);
    expect(afterSendgrid.smtpUsername).toBe("real@gmail.com");
    expect(afterSendgrid.usernamePlaceholder).toBe("");
  });
});
