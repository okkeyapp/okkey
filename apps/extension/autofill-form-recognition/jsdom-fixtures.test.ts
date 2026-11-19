/**
 * Vitest + jsdom evaluation of owned fixture HTML (not third-party snapshots).
 * When a local Playwright cache exists, the same path can load cache/page.html.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { FIXTURES_DIR, CACHE_DIR } from "./src/paths.ts";
import { predictRoleFromHints } from "./src/predict.ts";
import type { AnnotationFieldHints, MetricRole } from "./src/types.ts";

function loadHtmlIntoDocument(html: string): void {
  document.open();
  document.write(html);
  document.close();
}

function hintsFromInput(el: HTMLInputElement): AnnotationFieldHints {
  let labelText = "";
  if (el.labels) {
    labelText = Array.from(el.labels)
      .map((label) => label.textContent ?? "")
      .join(" ");
  }
  return {
    type: el.type,
    name: el.name || undefined,
    id: el.id || undefined,
    autocomplete: el.getAttribute("autocomplete") || undefined,
    placeholder: el.placeholder || undefined,
    ariaLabel: el.getAttribute("aria-label") || undefined,
    labelText: labelText || undefined,
    inputMode: el.inputMode || undefined,
    maxLength: el.maxLength > 0 ? el.maxLength : undefined,
    role: el.getAttribute("role") || undefined,
  };
}

function predictVisibleRoles(): MetricRole[] {
  const roles: MetricRole[] = [];
  for (const el of Array.from(document.querySelectorAll("input"))) {
    if (!(el instanceof HTMLInputElement) || el.type === "hidden") {
      continue;
    }
    const role = predictRoleFromHints(hintsFromInput(el));
    if (role) {
      roles.push(role);
    }
  }
  return roles.sort();
}

describe("jsdom fixture HTML evaluation", () => {
  it("login-basic → username + password", () => {
    loadHtmlIntoDocument(readFileSync(path.join(FIXTURES_DIR, "login-basic.html"), "utf8"));
    expect(predictVisibleRoles()).toEqual(["password", "username"]);
  });

  it("register-new-password → username + new-password", () => {
    loadHtmlIntoDocument(
      readFileSync(path.join(FIXTURES_DIR, "register-new-password.html"), "utf8"),
    );
    expect(predictVisibleRoles()).toEqual(["new-password", "username"]);
  });

  it("otp-step → otp", () => {
    loadHtmlIntoDocument(readFileSync(path.join(FIXTURES_DIR, "otp-step.html"), "utf8"));
    expect(predictVisibleRoles()).toEqual(["otp"]);
  });

  it("search-page → no metric roles", () => {
    loadHtmlIntoDocument(readFileSync(path.join(FIXTURES_DIR, "search-page.html"), "utf8"));
    expect(predictVisibleRoles()).toEqual([]);
  });

  it("checkout-card → no metric roles (card fields are not FP by themselves)", () => {
    loadHtmlIntoDocument(readFileSync(path.join(FIXTURES_DIR, "checkout-card.html"), "utf8"));
    expect(predictVisibleRoles()).toEqual([]);
  });
});

describe("optional local cache smoke", () => {
  it("evaluates a cached page when present (skipped if cache empty)", () => {
    if (!existsSync(CACHE_DIR)) {
      return;
    }
    // Prefer wikipedia cache if present from local capture.
    const candidates = [
      "en.wikipedia.org__461a7208",
      "ru.wikipedia.org__3f2d0b8a",
    ];
    let htmlPath: string | null = null;
    for (const id of candidates) {
      const candidate = path.join(CACHE_DIR, id, "page.html");
      if (existsSync(candidate)) {
        htmlPath = candidate;
        break;
      }
    }
    if (!htmlPath) {
      // Cache may exist for other domains only — still OK.
      expect(true).toBe(true);
      return;
    }
    loadHtmlIntoDocument(readFileSync(htmlPath, "utf8"));
    const roles = predictVisibleRoles();
    expect(roles).toContain("username");
    expect(roles).toContain("password");
  });
});
