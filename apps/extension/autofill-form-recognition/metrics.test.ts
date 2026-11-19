import { describe, expect, it } from "vitest";

import { buildAgreement, isFormFullyRecognized, roleMetricsFromCounts } from "./src/metrics.ts";
import { predictRoleFromHints } from "./src/predict.ts";
import { buildMetricsReport } from "./src/evaluate.ts";
import { assertNotWorseThanBaseline } from "./src/threshold.ts";
import { validateAllAnnotations } from "./src/annotations.ts";
import type { PageAnnotation } from "./src/types.ts";

describe("roleMetricsFromCounts", () => {
  it("returns no data when denominator is 0", () => {
    const m = roleMetricsFromCounts({ tp: 0, fp: 0, fn: 0 });
    expect(m.precision).toBe("no data");
    expect(m.recall).toBe("no data");
    expect(m.f1).toBe("no data");
  });

  it("computes precision recall f1", () => {
    const m = roleMetricsFromCounts({ tp: 1, fp: 1, fn: 0 });
    expect(m.precision).toBe(0.5);
    expect(m.recall).toBe(1);
    expect(m.f1).toBeCloseTo(2 / 3);
  });
});

describe("predictRoleFromHints (current classifier mapping)", () => {
  it("maps email to username and current-password to password", () => {
    expect(
      predictRoleFromHints({ type: "email", name: "email", autocomplete: "email" }),
    ).toBe("username");
    expect(
      predictRoleFromHints({
        type: "password",
        name: "password",
        autocomplete: "current-password",
      }),
    ).toBe("password");
  });

  it("maps new-password autocomplete to new-password", () => {
    expect(
      predictRoleFromHints({
        type: "password",
        name: "new-password",
        autocomplete: "new-password",
      }),
    ).toBe("new-password");
  });

  it("maps one-time-code to otp", () => {
    expect(
      predictRoleFromHints({
        type: "text",
        name: "otp",
        autocomplete: "one-time-code",
        inputMode: "numeric",
      }),
    ).toBe("otp");
  });
});

describe("agreement + full recognition", () => {
  const baseA: PageAnnotation = {
    schemaVersion: 1,
    pageId: "t",
    url: "fixture://t",
    lang: "EN",
    annotator: "A",
    status: "annotated",
    pageKind: "login",
    forms: [
      {
        formId: "form-1",
        selector: "form",
        fields: [
          {
            selector: "#u",
            role: "username",
            hints: { type: "text", id: "u", autocomplete: "username" },
          },
          {
            selector: "#p",
            role: "password",
            hints: { type: "password", id: "p", autocomplete: "current-password" },
          },
        ],
      },
    ],
  };

  it("excludes disagreements from the denominator", () => {
    const b: PageAnnotation = {
      ...baseA,
      annotator: "B",
      forms: [
        {
          formId: "form-1",
          selector: "form",
          fields: [
            {
              selector: "#u",
              role: "username",
              hints: { type: "text", id: "u", autocomplete: "username" },
            },
            {
              selector: "#p",
              role: "otp",
              hints: { type: "password", id: "p", autocomplete: "current-password" },
            },
          ],
        },
      ],
    };
    const agreement = buildAgreement(baseA, b);
    expect(agreement.forms).toHaveLength(0);
    expect(agreement.disagreements.length).toBeGreaterThan(0);
  });

  it("marks matching A/B form as fully recognized when classifier agrees", () => {
    const b: PageAnnotation = { ...baseA, annotator: "B" };
    const agreement = buildAgreement(baseA, b);
    expect(agreement.forms).toHaveLength(1);
    const predicted = new Map<string, "username" | "password" | "new-password" | "otp">([
      ["t::form-1::#u", "username"],
      ["t::form-1::#p", "password"],
    ]);
    expect(isFormFullyRecognized(agreement.forms[0]!, predicted)).toBe(true);
  });
});

describe("committed corpus annotations + baseline gate", () => {
  it("validates all annotation files", () => {
    const result = validateAllAnnotations();
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("builds a report and equals itself under the threshold policy", () => {
    const report = buildMetricsReport();
    expect(report.schemaVersion).toBe(1);
    expect(report.runComposition.syntheticFixturePages).toBeGreaterThanOrEqual(4);
    // Dual-annotated fixtures should produce numeric (a), not no data.
    expect(report.overall.formRecognition.share).not.toBe("no data");
    const gate = assertNotWorseThanBaseline(report, report);
    expect(gate.ok).toBe(true);
  });
});
