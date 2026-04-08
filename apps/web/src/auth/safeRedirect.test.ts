import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "./safeRedirect";

describe("safeRedirectPath", () => {
  it("returns fallback for null and empty", () => {
    expect(safeRedirectPath(null, "/workspaces")).toBe("/workspaces");
    expect(safeRedirectPath("", "/workspaces")).toBe("/workspaces");
  });

  it("allows same-origin paths only", () => {
    expect(safeRedirectPath("/vault/items", "/workspaces")).toBe("/vault/items");
    expect(safeRedirectPath("/workspaces?x=1", "/a")).toBe("/workspaces?x=1");
  });

  it("rejects external and scheme-relative URLs", () => {
    expect(safeRedirectPath("https://evil.test/phish", "/safe")).toBe("/safe");
    expect(safeRedirectPath("//evil.test/phish", "/safe")).toBe("/safe");
    expect(safeRedirectPath("relative-no-slash", "/safe")).toBe("/safe");
  });
});
