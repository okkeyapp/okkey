import { buildLicenseRequestEmailCopy } from "@okkey/i18n";
import { describe, expect, it } from "vitest";

import { buildLicenseMailto } from "./buildLicenseMailto";

describe("buildLicenseMailto", () => {
  it("prefills subject/body identical to shared builder using API sales inbox", () => {
    const fields = {
      salesEmail: "sales@example.com",
      workspaceName: "Acme",
      workspaceUrl: "https://vault.example",
      currentPlanTier: "FREE",
      requestedPlanTier: "ENTERPRISE",
      deploymentMode: "self-hosted",
      memberCount: 12,
      region: "RU",
      locale: "ru",
      emailLocale: "ru",
      senderEmail: "owner@acme.test",
      replyEmail: "reply@acme.test",
    };
    const href = buildLicenseMailto(fields);
    const copy = buildLicenseRequestEmailCopy("ru", fields);

    expect(href.startsWith("mailto:sales@example.com?")).toBe(true);
    // Mailto must use %20, not application/x-www-form-urlencoded `+` for spaces.
    expect(href).not.toMatch(/[?&](?:subject|body)=[^&]*\+/);
    const query = new URL(href).searchParams;
    expect(query.get("subject")).toBe(copy.subject);
    expect(query.get("body")).toBe(copy.body);
    expect(copy.subject).toBe("Заявка на лицензию: ENTERPRISE — Acme");
    expect(copy.lead).toBe("Новая заявка на лицензию Okkey.");
    expect(copy.body).toContain("Новая заявка на лицензию Okkey.");
    expect(copy.body).toContain("Название пространства: Acme");
    expect(copy.body).toContain("URL пространства: https://vault.example");
    expect(copy.body).toContain("Запрошенный тариф: ENTERPRISE");
    expect(copy.body).toContain("Текущий тариф: FREE");
    expect(copy.body).toContain("Режим: self-hosted");
    expect(copy.body).toContain("Участники: 12");
    expect(copy.body).toContain("Регион: RU");
    expect(copy.body).toContain("Язык: ru");
    expect(copy.body).toContain("Отправитель: owner@acme.test");
    expect(copy.body).toContain("Email для связи: reply@acme.test");
  });

  it("encodes multi-word workspace labels with %20 (not +)", () => {
    const href = buildLicenseMailto({
      salesEmail: "inbox@example.com",
      workspaceName: "Okkey team",
      workspaceUrl: "https://okkey.example",
      currentPlanTier: "FREE",
      requestedPlanTier: "ENTERPRISE",
      deploymentMode: "self-hosted",
      region: null,
      locale: "en",
      senderEmail: "a@b.co",
    });
    expect(href).toContain("License%20request%3A%20ENTERPRISE%20%E2%80%94%20Okkey%20team");
    expect(href).toContain("Workspace%20name%3A%20Okkey%20team");
    expect(href).toContain("Requested%20plan%3A%20ENTERPRISE");
    expect(href).toContain("Current%20plan%3A%20FREE");
    expect(href).not.toContain("Okkey+team");
    expect(href).not.toContain("Workspace+name");
  });

  it("rejects empty sales email (no client default)", () => {
    expect(() =>
      buildLicenseMailto({
        salesEmail: "  ",
        workspaceName: "Demo",
        workspaceUrl: "",
        currentPlanTier: "FREE",
        requestedPlanTier: "ENTERPRISE",
        deploymentMode: "self-hosted",
        region: null,
        locale: "en",
        senderEmail: "a@b.co",
      }),
    ).toThrow(/sales email is required/i);
  });
});
