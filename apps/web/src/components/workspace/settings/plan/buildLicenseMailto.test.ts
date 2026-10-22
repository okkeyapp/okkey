import { describe, expect, it } from "vitest";

import { buildLicenseMailto, DEFAULT_LICENSE_SALES_EMAIL } from "./buildLicenseMailto";

describe("buildLicenseMailto", () => {
  it("prefills subject/body and defaults sales inbox", () => {
    const href = buildLicenseMailto({
      workspaceName: "Acme",
      workspaceUrl: "https://vault.example",
      memberCount: 12,
      region: "RU",
      locale: "ru",
      senderEmail: "owner@acme.test",
      replyEmail: "reply@acme.test",
    });

    expect(href.startsWith(`mailto:${DEFAULT_LICENSE_SALES_EMAIL}?`)).toBe(true);
    const query = new URL(href).searchParams;
    expect(query.get("subject")).toBe("License request: Acme");
    const body = query.get("body") ?? "";
    expect(body).toContain("Workspace name: Acme");
    expect(body).toContain("Workspace URL: https://vault.example");
    expect(body).toContain("Members: 12");
    expect(body).toContain("Region: RU");
    expect(body).toContain("Locale: ru");
    expect(body).toContain("Sender: owner@acme.test");
    expect(body).toContain("Reply email: reply@acme.test");
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
