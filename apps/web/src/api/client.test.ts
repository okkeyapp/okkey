import { describe, expect, it, vi } from "vitest";

import { resolveApiBaseUrl } from "./client";

describe("resolveApiBaseUrl", () => {
  it("uses default when empty or missing", () => {
    expect(resolveApiBaseUrl(undefined)).toBe("http://localhost:4000");
    expect(resolveApiBaseUrl("")).toBe("http://localhost:4000");
    expect(resolveApiBaseUrl("   ")).toBe("http://localhost:4000");
  });

  it("rejects literal undefined/null strings", () => {
    const warn = vi.fn();
    expect(resolveApiBaseUrl("undefined", warn)).toBe("http://localhost:4000");
    expect(resolveApiBaseUrl("UNDEFINED", warn)).toBe("http://localhost:4000");
    expect(resolveApiBaseUrl("null", warn)).toBe("http://localhost:4000");
    expect(warn).toHaveBeenCalled();
  });

  it("normalizes http origins", () => {
    expect(resolveApiBaseUrl("http://localhost:4000/")).toBe("http://localhost:4000");
    expect(resolveApiBaseUrl("http://127.0.0.1:9000/api")).toBe("http://127.0.0.1:9000/api");
  });

  it("calls onInvalid for bad URLs", () => {
    const warn = vi.fn();
    expect(resolveApiBaseUrl("not-a-url", warn)).toBe("http://localhost:4000");
    expect(warn).toHaveBeenCalled();
  });
});
