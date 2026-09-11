import { describe, expect, it } from "vitest";

import { calendarDaysBetween } from "./calendarDaysBetween";

describe("calendarDaysBetween", () => {
  it("treats same local calendar day as 0 even under 24h apart", () => {
    const from = new Date(2026, 8, 11, 0, 30, 0);
    const to = new Date(2026, 8, 11, 23, 50, 0);
    expect(calendarDaysBetween(from, to)).toBe(0);
  });

  it("treats previous local calendar day as 1 even under 24h apart", () => {
    const from = new Date(2026, 8, 10, 23, 40, 0);
    const to = new Date(2026, 8, 11, 15, 21, 0);
    expect(calendarDaysBetween(from, to)).toBe(1);
  });

  it("counts multi-day calendar gaps", () => {
    const from = new Date(2026, 8, 1, 12, 0, 0);
    const to = new Date(2026, 8, 11, 8, 0, 0);
    expect(calendarDaysBetween(from, to)).toBe(10);
  });
});
