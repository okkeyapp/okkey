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
  fillAutofillValues,
  resolveAutofillKindForElement,
  SEGMENTED_OTP_MIN_FIELDS,
  SEGMENTED_OTP_MAX_FIELDS,
} from "../src/lib/loginFormFields.ts";
import {
  isNewPasswordField,
  isCurrentPasswordField,
  shouldOpenPasswordGenerator,
  detectFormTypeForInput,
  categoriesAllowedForFormType,
} from "../src/lib/autofillFormDetect.ts";

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
      expect(fields.username.length).toBe(0);
      // Every cell resolves to otp — never username/password for suggestions/fill.
      for (const el of fields.otp) {
        expect(resolveAutofillKindForElement(el)).toBe("otp");
        expect(classifyAutofillInput(collectInputHints(el))).toBe("otp");
      }
    }
  });

  it("8-cell OTP with one-time-code is otp-only (not login username/password offers)", () => {
    loadHtmlIntoDocument(readFileSync(path.join(FIXTURES_DIR, "segmented-otp-8.html"), "utf8"));
    for (const el of Array.from(document.querySelectorAll("input"))) {
      Object.defineProperty(el, "getClientRects", {
        value: () => [{ width: 24, height: 24, top: 0, left: 0, bottom: 24, right: 24 }],
      });
    }
    const fields = findLoginFields(document);
    expect(fields.otp.length).toBe(8);
    expect(fields.username).toEqual([]);
    expect(fields.password).toEqual([]);
    const first = fields.otp[0]!;
    expect(resolveAutofillKindForElement(first)).toBe("otp");
    // Password must never be the fill target for these cells.
    fillLoginForm(document, { username: "alice", password: "secret-password", totp: "12345678" });
    for (const el of fields.otp) {
      expect(el.value).not.toBe("secret-password");
      expect(el.value).not.toBe("alice");
    }
    expect(fields.otp.map((el) => el.value).join("")).toBe("12345678");
  });

  it("change-password: current-password does not open generator; new/confirm do", () => {
    loadHtmlIntoDocument(
      readFileSync(path.join(FIXTURES_DIR, "change-password-roles.html"), "utf8"),
    );
    for (const el of Array.from(document.querySelectorAll("input"))) {
      Object.defineProperty(el, "getClientRects", {
        value: () => [{ width: 100, height: 20, top: 0, left: 0, bottom: 20, right: 100 }],
      });
    }
    const current = document.querySelector("#current") as HTMLInputElement;
    const neo = document.querySelector("#neo") as HTMLInputElement;
    const confirm = document.querySelector("#confirm") as HTMLInputElement;
    const formType = detectFormTypeForInput(current);
    expect(formType).toBe("register");
    expect(shouldOpenPasswordGenerator(formType, "password", current)).toBe(false);
    expect(shouldOpenPasswordGenerator(formType, "password", neo)).toBe(true);
    expect(shouldOpenPasswordGenerator(formType, "password", confirm)).toBe(true);
  });

  it("open shadow login is discovered and resolves login kinds for overlay/fill", () => {
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
    for (const el of inputs) {
      Object.defineProperty(el, "getClientRects", {
        value: () => [{ width: 100, height: 20, top: 0, left: 0, bottom: 20, right: 100 }],
      });
    }
    const fields = findLoginFields(document);
    expect(fields.username.some((el) => el.id === "su")).toBe(true);
    expect(fields.password.some((el) => el.id === "sp")).toBe(true);
    const user = fields.username.find((el) => el.id === "su")!;
    const pass = fields.password.find((el) => el.id === "sp")!;
    expect(resolveAutofillKindForElement(user)).toBe("username");
    expect(resolveAutofillKindForElement(pass)).toBe("password");
    // Shadow nodes are connected but not document.contains — overlay must use isConnected.
    expect(user.isConnected).toBe(true);
    expect(document.contains(user)).toBe(false);
    fillLoginForm(document, { username: "shadow-user", password: "shadow-pass" });
    expect(user.value).toBe("shadow-user");
    expect(pass.value).toBe("shadow-pass");
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

  it("loyalty-en: classifies loyalty kinds and never login/personal_data", () => {
    loadHtmlIntoDocument(readFileSync(path.join(FIXTURES_DIR, "loyalty-en.html"), "utf8"));
    for (const el of Array.from(document.querySelectorAll("input"))) {
      Object.defineProperty(el, "getClientRects", {
        value: () => [{ width: 100, height: 20, top: 0, left: 0, bottom: 20, right: 100 }],
      });
    }
    const member = document.querySelector("#member") as HTMLInputElement;
    const program = document.querySelector("#program") as HTMLInputElement;
    const barcode = document.querySelector("#barcode") as HTMLInputElement;
    expect(classifyAutofillInput(collectInputHints(member))).toBe("loyalty-card-number");
    expect(classifyAutofillInput(collectInputHints(program))).toBe("loyalty-provider");
    expect(classifyAutofillInput(collectInputHints(barcode))).toBe("loyalty-barcode");
    expect(categoriesAllowedForFormType("login", "loyalty-card-number")).toEqual(["loyalty_card"]);
    expect(categoriesAllowedForFormType("unknown", "loyalty-card-number")).toEqual(["loyalty_card"]);
    expect(predictVisibleRoles()).toEqual([]);
  });

  it("loyalty-ru: Russian labels classify and are overlay targets", () => {
    loadHtmlIntoDocument(readFileSync(path.join(FIXTURES_DIR, "loyalty-ru.html"), "utf8"));
    for (const el of Array.from(document.querySelectorAll("input"))) {
      Object.defineProperty(el, "getClientRects", {
        value: () => [{ width: 100, height: 20, top: 0, left: 0, bottom: 20, right: 100 }],
      });
    }
    expect(classifyAutofillInput(collectInputHints(document.querySelector("#member") as HTMLInputElement))).toBe(
      "loyalty-card-number",
    );
    expect(classifyAutofillInput(collectInputHints(document.querySelector("#program") as HTMLInputElement))).toBe(
      "loyalty-provider",
    );
    expect(classifyAutofillInput(collectInputHints(document.querySelector("#barcode") as HTMLInputElement))).toBe(
      "loyalty-barcode",
    );
    expect(resolveAutofillKindForElement(document.querySelector("#member") as HTMLInputElement)).toBe(
      "loyalty-card-number",
    );
  });

  it("travel-booking: PNR / carrier / flight / from / to classify for overlay", () => {
    loadHtmlIntoDocument(readFileSync(path.join(FIXTURES_DIR, "travel-booking.html"), "utf8"));
    for (const el of Array.from(document.querySelectorAll("input"))) {
      Object.defineProperty(el, "getClientRects", {
        value: () => [{ width: 100, height: 20, top: 0, left: 0, bottom: 20, right: 100 }],
      });
    }
    expect(classifyAutofillInput(collectInputHints(document.querySelector("#pnr") as HTMLInputElement))).toBe(
      "travel-booking-reference",
    );
    expect(classifyAutofillInput(collectInputHints(document.querySelector("#carrier") as HTMLInputElement))).toBe(
      "travel-carrier",
    );
    expect(classifyAutofillInput(collectInputHints(document.querySelector("#flight") as HTMLInputElement))).toBe(
      "travel-trip-number",
    );
    expect(classifyAutofillInput(collectInputHints(document.querySelector("#from") as HTMLInputElement))).toBe(
      "travel-from",
    );
    expect(classifyAutofillInput(collectInputHints(document.querySelector("#to") as HTMLInputElement))).toBe(
      "travel-to",
    );
    expect(categoriesAllowedForFormType("unknown", "travel-booking-reference")).toEqual([
      "travel_booking",
    ]);
  });

  it("vehicle-plate: License plate fills from vehicle-plate value", () => {
    loadHtmlIntoDocument(readFileSync(path.join(FIXTURES_DIR, "vehicle-plate.html"), "utf8"));
    for (const el of Array.from(document.querySelectorAll("input"))) {
      Object.defineProperty(el, "getClientRects", {
        value: () => [{ width: 100, height: 20, top: 0, left: 0, bottom: 20, right: 100 }],
      });
    }
    const plate = document.querySelector("#plate") as HTMLInputElement;
    expect(classifyAutofillInput(collectInputHints(plate))).toBe("vehicle-plate");
    expect(classifyAutofillInput(collectInputHints(document.querySelector("#make") as HTMLInputElement))).toBe(
      "vehicle-make-model",
    );
    expect(classifyAutofillInput(collectInputHints(document.querySelector("#vin") as HTMLInputElement))).toBe(
      "vehicle-vin",
    );
    const filled = fillAutofillValues(document, {
      "vehicle-plate": "A123BC77",
      "vehicle-make-model": "Toyota Camry",
      "vehicle-vin": "JTDBR32E720123456",
      "vehicle-inspection-due": "2027-01-01",
      "vehicle-insurer": "Ingospakh",
      "vehicle-insurance-policy-number": "POL-1",
      "vehicle-insurance-valid-until": "2027-06-01",
    });
    expect(filled).toBeGreaterThanOrEqual(7);
    expect(plate.value).toBe("A123BC77");
    expect((document.querySelector("#make") as HTMLInputElement).value).toBe("Toyota Camry");
    expect((document.querySelector("#vin") as HTMLInputElement).value).toBe("JTDBR32E720123456");
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
