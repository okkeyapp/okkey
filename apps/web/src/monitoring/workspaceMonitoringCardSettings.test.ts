import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_MONITORING_CARD_SETTINGS,
  workspaceMonitoringCardSettingsFromDto,
  workspaceMonitoringCardSettingsToDto,
} from "@okkey/types";

describe("workspaceMonitoringCardSettingsFromDto", () => {
  it("returns all-true defaults for null/undefined", () => {
    expect(workspaceMonitoringCardSettingsFromDto(undefined)).toEqual(
      DEFAULT_WORKSPACE_MONITORING_CARD_SETTINGS,
    );
    expect(workspaceMonitoringCardSettingsFromDto(null)).toEqual(
      DEFAULT_WORKSPACE_MONITORING_CARD_SETTINGS,
    );
  });

  it("merges partial enabled_cards over defaults", () => {
    expect(
      workspaceMonitoringCardSettingsFromDto({
        enabled_cards: { compromised: false, weak: false },
      }),
    ).toEqual({
      ...DEFAULT_WORKSPACE_MONITORING_CARD_SETTINGS,
      compromised: false,
      weak: false,
    });
  });

  it("ignores unknown keys and non-boolean values", () => {
    expect(
      workspaceMonitoringCardSettingsFromDto({
        enabled_cards: {
          compromised: true,
          notACard: false,
          weak: "no",
        } as Record<string, unknown>,
      } as Parameters<typeof workspaceMonitoringCardSettingsFromDto>[0]),
    ).toEqual({
      ...DEFAULT_WORKSPACE_MONITORING_CARD_SETTINGS,
      compromised: true,
    });
  });
});

describe("workspaceMonitoringCardSettingsToDto", () => {
  it("round-trips enabled flags", () => {
    const settings = {
      ...DEFAULT_WORKSPACE_MONITORING_CARD_SETTINGS,
      overall: false,
    };
    expect(
      workspaceMonitoringCardSettingsFromDto(workspaceMonitoringCardSettingsToDto(settings)),
    ).toEqual(settings);
  });
});
