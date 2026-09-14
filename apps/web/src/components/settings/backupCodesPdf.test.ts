import { describe, expect, it } from "vitest";

import {
  buildBackupCodesPdfBytes,
  formatBackupCodesForClipboard,
} from "./backupCodesPdf";

const englishCopy = {
  title: "Backup recovery codes",
  description: "Store these codes offline. Each code works once.",
};

const russianCopy = {
  title: "Резервные коды",
  description: "Храните эти коды офлайн. Каждый код можно использовать только один раз.",
};

describe("backupCodesPdf", () => {
  it("joins codes with newlines for clipboard", () => {
    expect(formatBackupCodesForClipboard(["AAAA-BBBB", "CCCC-DDDD"])).toBe(
      "AAAA-BBBB\nCCCC-DDDD",
    );
  });

  it("builds a non-empty PDF for english copy", async () => {
    const bytes = await buildBackupCodesPdfBytes(["CODE-ONE", "CODE-TWO"], englishCopy);
    expect(bytes.byteLength).toBeGreaterThan(5000);
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text.startsWith("%PDF")).toBe(true);
    expect(text).toContain("%%EOF");
  });

  it("builds a non-empty PDF for russian copy", async () => {
    const bytes = await buildBackupCodesPdfBytes(["AAAA-BBBB-CC"], russianCopy);
    expect(bytes.byteLength).toBeGreaterThan(5000);
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text.startsWith("%PDF")).toBe(true);
    expect(text).toContain("%%EOF");
  });
});
