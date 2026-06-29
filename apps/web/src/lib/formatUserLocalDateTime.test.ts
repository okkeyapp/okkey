import { describe, expect, it } from "vitest";

import { formatUserLocalDateParts } from "./formatUserLocalDateTime";

const SAMPLE_UTC_MS = Date.parse("2026-06-29T12:00:00.000Z");

describe("formatUserLocalDateParts", () => {
  it("formats Moscow local time for ru locale", () => {
    const { date, time } = formatUserLocalDateParts(SAMPLE_UTC_MS, {
      locale: "ru",
      timeZone: "Europe/Moscow",
    });

    expect(date).toContain("2026");
    expect(date).toContain("июн");
    expect(time).toBe("15:00");
  });

  it("formats New York local time for en locale", () => {
    const { time } = formatUserLocalDateParts(SAMPLE_UTC_MS, {
      locale: "en",
      timeZone: "America/New_York",
    });

    expect(time).toBe("08:00 AM");
  });

  it("uses different clock times for the same instant in different zones", () => {
    const moscow = formatUserLocalDateParts(SAMPLE_UTC_MS, {
      locale: "en",
      timeZone: "Europe/Moscow",
    });
    const newYork = formatUserLocalDateParts(SAMPLE_UTC_MS, {
      locale: "en",
      timeZone: "America/New_York",
    });

    expect(moscow.time).not.toBe(newYork.time);
  });
});
