import { buildLicenseRequestEmailCopy } from "@okkey/i18n";
import { describe, expect, it } from "vitest";

import { buildLicenseMailto, DEFAULT_LICENSE_SALES_EMAIL } from "./buildLicenseMailto";

describe("buildLicenseMailto", () => {
  it("prefills subject/body identical to shared builder and defaults sales inbox", () => {
    const fields = {
      workspaceName: "Acme",
      workspaceUrl: "https://vault.example",
      memberCount: 12,
      region: "RU",
      locale: "ru",
      emailLocale: "ru",
      senderEmail: "owner@acme.test",
      replyEmail: "reply@acme.test",
    };
    const href = buildLicenseMailto(fields);
    const copy = buildLicenseRequestEmailCopy("ru", fields);

    expect(href.startsWith(`mailto:${DEFAULT_LICENSE_SALES_EMAIL}?`)).toBe(true);
    // Mailto must use %20, not application/x-www-form-urlencoded `+` for spaces.
    expect(href).not.toMatch(/[?&](?:subject|body)=[^&]*\+/);
    const query = new URL(href).searchParams;
    expect(query.get("subject")).toBe(copy.subject);
    expect(query.get("body")).toBe(copy.body);
    expect(copy.subject).toBe("Заявка на лицензию: Acme");
    expect(copy.body).toContain("Название пространства: Acme");
    expect(copy.body).toContain("URL пространства: https://vault.example");
    expect(copy.body).toContain("Участники: 12");
    expect(copy.body).toContain("Регион: RU");
    expect(copy.body).toContain("Язык: ru");
    expect(copy.body).toContain("Отправитель: owner@acme.test");
    expect(copy.body).toContain("Email для связи: reply@acme.test");
  });

  it("encodes multi-word workspace labels with %20 (not +)", () => {
    const href = buildLicenseMailto({
      workspaceName: "Okkey team",
      workspaceUrl: "https://okkey.example",
      region: null,
      locale: "en",
      senderEmail: "a@b.co",
    });
    expect(href).toContain("License%20request%3A%20Okkey%20team");
    expect(href).toContain("Workspace%20name%3A%20Okkey%20team");
    expect(href).not.toContain("Okkey+team");
    expect(href).not.toContain("Workspace+name");
  });

  it("uses sales_email from API when provided", () => {
    const href = buildLicenseMailto({
      salesEmail: "sales@example.com",
      workspaceName: "Demo",
      workspaceUrl: "",
      region: null,
      locale: "en",
      senderEmail: "a@b.co",
    });
    expect(href.startsWith("mailto:sales@example.com?")).toBe(true);
    const body = new URL(href).searchParams.get("body") ?? "";
    expect(body).toContain("Members: ");
    expect(body).toContain("Region: —");
  });
});
