import { describe, expect, it } from "vitest";

import { formatAvailableUpdatesSummary, type UpdateCheckInfo } from "./useUpdateCheck";

describe("formatAvailableUpdatesSummary", () => {
  it("formats from→to for self-host available updates", () => {
    const info: UpdateCheckInfo = {
      deploymentMode: "self_hosted",
      feedConfigured: true,
      current: { okkey: "1.0.0", enterprise: "1.0.0-beta.1" },
      available: [
        { id: "okkey", from: "1.0.0", to: "1.0.1", notes: "core" },
        { id: "okkey-enterprise", from: "1.0.0-beta.1", to: "1.0.0-beta.2", notes: null },
      ],
    };
    expect(formatAvailableUpdatesSummary(info)).toBe(
      "okkey 1.0.0→1.0.1; okkey-enterprise 1.0.0-beta.1→1.0.0-beta.2",
    );
  });

  it("returns null on saas or empty available", () => {
    expect(
      formatAvailableUpdatesSummary({
        deploymentMode: "saas",
        feedConfigured: true,
        current: { okkey: "1.0.0", enterprise: null },
        available: [{ id: "okkey", from: "1.0.0", to: "2.0.0", notes: null }],
      }),
    ).toBeNull();
    expect(
      formatAvailableUpdatesSummary({
        deploymentMode: "self_hosted",
        feedConfigured: false,
        current: { okkey: "1.0.0", enterprise: null },
        available: [],
      }),
    ).toBeNull();
  });
});
