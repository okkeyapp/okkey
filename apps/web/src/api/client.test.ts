import { describe, expect, it, vi } from "vitest";

import { resolveApiBaseUrl } from "./client";

const DEV_FALLBACK = "http://localhost:4000";
const PROD_FALLBACK = "";

describe("resolveApiBaseUrl", () => {
  describe("development fallback", () => {
    it("uses localhost when empty or missing", () => {
      expect(resolveApiBaseUrl(undefined, undefined, { fallback: DEV_FALLBACK })).toBe(
        DEV_FALLBACK,
      );
      expect(resolveApiBaseUrl("", undefined, { fallback: DEV_FALLBACK })).toBe(DEV_FALLBACK);
      expect(resolveApiBaseUrl("   ", undefined, { fallback: DEV_FALLBACK })).toBe(DEV_FALLBACK);
    });

    it("rejects literal undefined/null strings", () => {
      const warn = vi.fn();
      expect(resolveApiBaseUrl("undefined", warn, { fallback: DEV_FALLBACK })).toBe(DEV_FALLBACK);
      expect(resolveApiBaseUrl("UNDEFINED", warn, { fallback: DEV_FALLBACK })).toBe(DEV_FALLBACK);
      expect(resolveApiBaseUrl("null", warn, { fallback: DEV_FALLBACK })).toBe(DEV_FALLBACK);
      expect(warn).toHaveBeenCalled();
    });

    it("calls onInvalid for bad URLs and keeps localhost fallback", () => {
      const warn = vi.fn();
      expect(resolveApiBaseUrl("not-a-url", warn, { fallback: DEV_FALLBACK })).toBe(DEV_FALLBACK);
      expect(warn).toHaveBeenCalled();
    });
  });

  describe("production fallback (TSK-305)", () => {
    it("uses same-origin empty base when empty or missing (never localhost)", () => {
      expect(resolveApiBaseUrl(undefined, undefined, { fallback: PROD_FALLBACK })).toBe("");
      expect(resolveApiBaseUrl("", undefined, { fallback: PROD_FALLBACK })).toBe("");
      expect(resolveApiBaseUrl("   ", undefined, { fallback: PROD_FALLBACK })).toBe("");
    });

    it("never falls back to localhost on invalid values", () => {
      const warn = vi.fn();
      expect(resolveApiBaseUrl("undefined", warn, { fallback: PROD_FALLBACK })).toBe("");
      expect(resolveApiBaseUrl("null", warn, { fallback: PROD_FALLBACK })).toBe("");
      expect(resolveApiBaseUrl("not-a-url", warn, { fallback: PROD_FALLBACK })).toBe("");
      expect(warn).toHaveBeenCalled();
      for (const call of warn.mock.calls) {
        expect(String(call[0])).not.toMatch(/localhost:4000/);
      }
    });

    it("respects an explicit absolute override", () => {
      expect(
        resolveApiBaseUrl("https://api.example.com/", undefined, { fallback: PROD_FALLBACK }),
      ).toBe("https://api.example.com");
      expect(
        resolveApiBaseUrl("https://api.example.com/v1/", undefined, { fallback: PROD_FALLBACK }),
      ).toBe("https://api.example.com/v1");
    });

    it("allows an explicit localhost override when configured", () => {
      expect(
        resolveApiBaseUrl("http://localhost:4000/", undefined, { fallback: PROD_FALLBACK }),
      ).toBe("http://localhost:4000");
    });
  });

  it("normalizes http origins", () => {
    expect(resolveApiBaseUrl("http://localhost:4000/")).toBe("http://localhost:4000");
    expect(resolveApiBaseUrl("http://127.0.0.1:9000/api")).toBe("http://127.0.0.1:9000/api");
  });
});
