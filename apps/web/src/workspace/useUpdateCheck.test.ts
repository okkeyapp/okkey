import { describe, expect, it } from "vitest";

import {
  filterAvailableUpdatesForPlanTier,
  formatAvailableUpdatesSummary,
  type UpdateCheckInfo,
} from "./useUpdateCheck";

describe("formatAvailableUpdatesSummary", () => {
  it("formats from→to for self-host available updates", () => {
    const info: UpdateCheckInfo = {
      deploymentMode: "self_hosted",
      feedConfigured: true,
      current: { okkey: "1.0.0-betta.3", enterprise: "1.0.0-betta.3" },
      available: [
        { id: "okkey", from: "1.0.0-betta.3", to: "1.0.0-betta.4", notes: "core" },
        {
          id: "okkey-enterprise",
          from: "1.0.0-betta.3",
          to: "1.0.0-betta.4",
          notes: null,
        },
      ],
    };
    expect(formatAvailableUpdatesSummary(info)).toBe(
      "okkey 1.0.0-betta.3→1.0.0-betta.4; okkey-enterprise 1.0.0-betta.3→1.0.0-betta.4",
    );
  });

  it("returns null on saas or empty available", () => {
    expect(
      formatAvailableUpdatesSummary({
        deploymentMode: "saas",
        feedConfigured: true,
        current: { okkey: "1.0.0-betta.3", enterprise: null },
        available: [
          { id: "okkey", from: "1.0.0-betta.3", to: "1.0.0-betta.4", notes: null },
        ],
      }),
    ).toBeNull();
    expect(
      formatAvailableUpdatesSummary({
        deploymentMode: "self_hosted",
        feedConfigured: false,
        current: { okkey: "1.0.0-betta.3", enterprise: null },
        available: [],
      }),
    ).toBeNull();
  });
});

describe("filterAvailableUpdatesForPlanTier", () => {
  const available = [
    { id: "okkey" as const, from: "1.0.0-betta.3", to: "1.0.0-betta.4", notes: null },
    {
      id: "okkey-enterprise" as const,
      from: "1.0.0-betta.3",
      to: "1.0.0-betta.4",
      notes: null,
    },
  ];

  it("FREE keeps only okkey", () => {
    expect(filterAvailableUpdatesForPlanTier(available, "FREE")).toEqual([available[0]]);
  });

  it("ENTERPRISE keeps both", () => {
    expect(filterAvailableUpdatesForPlanTier(available, "ENTERPRISE")).toEqual(available);
  });
});
