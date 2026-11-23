import { describe, expect, it } from "vitest";

import { formatSetupCodeGroups } from "./setupCodeFormat";

describe("formatSetupCodeGroups", () => {
  it("formats 16 hex chars into dashed groups", () => {
    expect(formatSetupCodeGroups("a1b2c3d4e5f67890")).toBe("a1b2-c3d4-e5f6-7890");
  });

  it("strips separators and non-hex on paste-like input", () => {
    expect(formatSetupCodeGroups("A1B2-C3D4 e5f6-7890")).toBe("a1b2-c3d4-e5f6-7890");
  });

  it("keeps partial groups while typing", () => {
    expect(formatSetupCodeGroups("a1b2c3")).toBe("a1b2-c3");
  });
});
