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
import {
  classifyAutofillInput,
  collectInputHints,
  queryAutofillInputs,
} from "../src/lib/autofillFieldClassify.ts";
import { extractAutofillFieldGroups } from "../src/lib/autofillDomLayers.ts";
import {
  findLoginFields,
  fillLoginForm,
  SEGMENTED_OTP_MIN_FIELDS,
  SEGMENTED_OTP_MAX_FIELDS,
} from "../src/lib/loginFormFields.ts";
import { isNewPasswordField, isCurrentPasswordField } from "../src/lib/autofillFormDetect.ts";

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

describe("owned complex fixtures", () => {
  it("orphan-login → username + password without <form>", () => {
    loadHtmlIntoDocument(readFileSync(path.join(FIXTURES_DIR, "orphan-login.html"), "utf8"));
    const groups = extractAutofillFieldGroups(document);
    expect(groups.some((g) => g.orphan)).toBe(true);
    expect(predictVisibleRoles()).toEqual(["password", "username"]);
  });

  it("backup-code is not classified as otp", () => {
    loadHtmlIntoDocument(readFileSync(path.join(FIXTURES_DIR, "backup-code.html"), "utf8"));
    expect(predictVisibleRoles()).toEqual([]);
    const input = document.querySelector("#backup-code");
    expect(input).toBeTruthy();
    expect(classifyAutofillInput(collectInputHints(input as HTMLInputElement))).toBeNull();
  });

  it("ru-otp-label → otp without 2fa/mfa/verify in URL", () => {
    loadHtmlIntoDocument(readFileSync(path.join(FIXTURES_DIR, "ru-otp-label.html"), "utf8"));
    expect(predictVisibleRoles()).toEqual(["otp"]);
  });

  it("change-password-roles resolves current vs new", () => {
    loadHtmlIntoDocument(
      readFileSync(path.join(FIXTURES_DIR, "change-password-roles.html"), "utf8"),
    );
    const current = collectInputHints(document.querySelector("#current") as HTMLInputElement);
    const neo = collectInputHints(document.querySelector("#neo") as HTMLInputElement);
    const confirm = collectInputHints(document.querySelector("#confirm") as HTMLInputElement);
    expect(isCurrentPasswordField(current, [current, neo, confirm])).toBe(true);
    expect(isNewPasswordField(neo, [current, neo, confirm])).toBe(true);
    expect(isNewPasswordField(confirm, [current, neo, confirm])).toBe(true);
  });

  it("segmented OTP 4/6/8 within fixture-derived bounds", () => {
    for (const [file, n] of [
      ["segmented-otp-4.html", 4],
      ["segmented-otp-6.html", 6],
      ["segmented-otp-8.html", 8],
    ] as const) {
      expect(n).toBeGreaterThanOrEqual(SEGMENTED_OTP_MIN_FIELDS);
      expect(n).toBeLessThanOrEqual(SEGMENTED_OTP_MAX_FIELDS);
      loadHtmlIntoDocument(readFileSync(path.join(FIXTURES_DIR, file), "utf8"));
      // Make inputs report non-zero geometry so visibility checks pass under jsdom.
      for (const el of Array.from(document.querySelectorAll("input"))) {
        Object.defineProperty(el, "getClientRects", {
          value: () => [{ width: 24, height: 24, top: 0, left: 0, bottom: 24, right: 24 }],
        });
      }
      const fields = findLoginFields(document);
      expect(fields.otp.length).toBe(n);
      expect(fields.password.length).toBe(0);
    }
  });

  it("open shadow login is discovered by queryAutofillInputs", () => {
    loadHtmlIntoDocument(readFileSync(path.join(FIXTURES_DIR, "shadow-login.html"), "utf8"));
    // Re-run shadow attach for jsdom (inline script may not execute on document.write).
    const host = document.getElementById("host");
    expect(host).toBeTruthy();
    if (host && !host.shadowRoot) {
      const root = host.attachShadow({ mode: "open" });
      root.innerHTML = `
        <form id="shadow-login">
          <input id="su" name="username" type="text" autocomplete="username" />
          <input id="sp" name="password" type="password" autocomplete="current-password" />
        </form>`;
    }
    const inputs = queryAutofillInputs(document);
    expect(inputs.some((el) => el.id === "su")).toBe(true);
    expect(inputs.some((el) => el.id === "sp")).toBe(true);
  });

  it("security: hidden password is not filled; OTP does not receive password", () => {
    loadHtmlIntoDocument(`<!DOCTYPE html><html><body>
      <form id="login">
        <input id="user" name="username" type="text" autocomplete="username" />
        <input id="hidden-pass" name="password" type="hidden" value="" />
        <input id="otp" name="otp" type="text" autocomplete="one-time-code" inputmode="numeric" />
      </form>
    </body></html>`);
    for (const el of Array.from(document.querySelectorAll("input"))) {
      Object.defineProperty(el, "getClientRects", {
        value: () =>
          (el as HTMLInputElement).type === "hidden"
            ? []
            : [{ width: 100, height: 20, top: 0, left: 0, bottom: 20, right: 100 }],
      });
    }
    fillLoginForm(document, {
      username: "alice",
      password: "secret-password",
      totp: "123456",
    });
    expect((document.querySelector("#hidden-pass") as HTMLInputElement).value).toBe("");
    expect((document.querySelector("#otp") as HTMLInputElement).value).toBe("123456");
    expect((document.querySelector("#otp") as HTMLInputElement).value).not.toBe("secret-password");
  });

  it("security: foreign-origin fill is refused", async () => {
    const { assertSameOriginFillAllowed, isForeignOriginFrame } = await import(
      "../src/lib/autofillDomLayers.ts"
    );
    const foreign = {
      top: { location: { origin: "https://top.example" } },
      location: { origin: "https://other.example" },
    } as unknown as Window;
    expect(isForeignOriginFrame(foreign)).toBe(true);
    expect(assertSameOriginFillAllowed(foreign)).toBe(false);

    loadHtmlIntoDocument(`<!DOCTYPE html><html><body>
      <input id="user" type="text" autocomplete="username" />
      <input id="pass" type="password" autocomplete="current-password" />
    </body></html>`);
    for (const el of Array.from(document.querySelectorAll("input"))) {
      Object.defineProperty(el, "getClientRects", {
        value: () => [{ width: 100, height: 20, top: 0, left: 0, bottom: 20, right: 100 }],
      });
    }
    // Patch document.defaultView to look foreign.
    Object.defineProperty(document, "defaultView", {
      configurable: true,
      value: foreign,
    });
    fillLoginForm(document, { username: "alice", password: "secret" });
    expect((document.querySelector("#user") as HTMLInputElement).value).toBe("");
    expect((document.querySelector("#pass") as HTMLInputElement).value).toBe("");
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
