import { describe, expect, it } from "vitest";

import { formatInstanceVersionLabel, type InstanceVersionInfo } from "./useInstanceVersion";

describe("formatInstanceVersionLabel", () => {
  const t = (key: string, values?: Record<string, string>) => {
    if (key === "web.nav.versionWithEnterprise") {
      return `Version ${values?.version} · Enterprise ${values?.enterprise}`;
    }
    if (key === "web.nav.version") {
      return `Version ${values?.version}`;
    }
    return key;
  };

  it("formats core-only version", () => {
    const info: InstanceVersionInfo = {
      okkey: "0.0.1",
      enterprise: null,
      deploymentMode: "self_hosted",
      enterpriseModulesEnabled: false,
    };
    expect(formatInstanceVersionLabel(info, t)).toBe("Version 0.0.1");
  });

  it("formats core + enterprise version", () => {
    const info: InstanceVersionInfo = {
      okkey: "0.0.1",
      enterprise: "1.0.0-beta.1",
      deploymentMode: "self_hosted",
      enterpriseModulesEnabled: true,
    };
    expect(formatInstanceVersionLabel(info, t)).toBe(
      "Version 0.0.1 · Enterprise 1.0.0-beta.1",
    );
  });
});
