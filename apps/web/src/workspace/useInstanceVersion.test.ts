import { describe, expect, it } from "vitest";

import { formatInstanceVersionLabel, type InstanceVersionInfo } from "./useInstanceVersion";

describe("formatInstanceVersionLabel", () => {
  const t = (key: string, values?: Record<string, string>) => {
    if (key === "web.nav.okkeyVersion") {
      return `Okkey v${values?.version}`;
    }
    return key;
  };

  it("formats single Okkey product version (no enterprise split)", () => {
    const info: InstanceVersionInfo = {
      okkey: "1.0.0-betta.3",
      enterprise: null,
      deploymentMode: "self_hosted",
      enterpriseModulesEnabled: false,
    };
    expect(formatInstanceVersionLabel(info, t)).toBe("Okkey v1.0.0-betta.3");
  });

  it("still shows only Okkey v{okkey} when enterprise is present", () => {
    const info: InstanceVersionInfo = {
      okkey: "1.0.0-betta.3",
      enterprise: "1.0.0-betta.3",
      deploymentMode: "self_hosted",
      enterpriseModulesEnabled: true,
    };
    expect(formatInstanceVersionLabel(info, t)).toBe("Okkey v1.0.0-betta.3");
  });
});
