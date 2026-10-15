import { describe, expect, it } from "vitest";

import { parseMemberCount } from "./parseMemberCount";

describe("parseMemberCount", () => {
  it("accepts plain positive integers", () => {
    expect(parseMemberCount("1")).toBe(1);
    expect(parseMemberCount("15")).toBe(15);
    expect(parseMemberCount(" 42 ")).toBe(42);
  });

  it("rejects empty, zero, and non-digit input without normalizing", () => {
    expect(parseMemberCount("")).toBeNull();
    expect(parseMemberCount("   ")).toBeNull();
    expect(parseMemberCount("0")).toBeNull();
    expect(parseMemberCount("-1")).toBeNull();
    expect(parseMemberCount("1.5")).toBeNull();
    expect(parseMemberCount("1e2")).toBeNull();
    expect(parseMemberCount("abc")).toBeNull();
    expect(parseMemberCount("12a")).toBeNull();
  });
});
