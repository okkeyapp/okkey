import { describe, expect, it } from "vitest";

import { formatSidebarVersionLabel } from "./version-label";
import { shouldShowVersionDot } from "./visibility";

const FULL_SHA = "6e6ee86fac86b6fb1a6cc05da1f71d7e99d70560";

describe("sidebar version label", () => {
  it("shows a tagged release without a commit", () => {
    expect(formatSidebarVersionLabel({ version: "1.0.0-beta.3" })).toEqual({
      label: "v1.0.0-beta.3",
      tooltip: null,
    });
    expect(
      formatSidebarVersionLabel({
        version: "1.0.0-beta.3",
        releaseTag: "v1.0.0-beta.3",
        commitSha: FULL_SHA,
      }),
    ).toEqual({
      label: "v1.0.0-beta.3",
      tooltip: null,
    });
  });

  it("shows a dev build as the version plus a 7-character SHA", () => {
    expect(
      formatSidebarVersionLabel({
        version: "1.0.0-beta.3",
        commitSha: FULL_SHA,
      }),
    ).toEqual({
      label: "v1.0.0-beta.3 6e6ee86",
      tooltip: FULL_SHA,
    });
    expect(
      formatSidebarVersionLabel({
        version: "0.0.0-dev",
        commitSha: FULL_SHA.toUpperCase(),
      }),
    ).toEqual({
      label: "v0.0.0-dev 6e6ee86",
      tooltip: FULL_SHA,
    });
    expect(formatSidebarVersionLabel({ version: FULL_SHA })).toEqual({
      label: "v0.0.0-dev 6e6ee86",
      tooltip: FULL_SHA,
    });
    expect(
      formatSidebarVersionLabel({
        version: `1.0.0-beta.3-${FULL_SHA}`,
      }),
    ).toEqual({
      label: "v1.0.0-beta.3 6e6ee86",
      tooltip: FULL_SHA,
    });
  });
});

describe("version dot", () => {
  const update = (toVersion: string) => [{ component: "okkey" as const, toVersion }];

  it("shows for a new version, stays hidden after it is seen, and returns for a newer one", () => {
    expect(shouldShowVersionDot(update("1.1.0"), {}, {})).toBe(true);
    expect(shouldShowVersionDot(update("1.1.0"), { okkey: "1.1.0" }, {})).toBe(false);
    expect(shouldShowVersionDot(update("1.1.0"), {}, { okkey: "1.1.0" })).toBe(false);
    expect(shouldShowVersionDot(update("1.1.0"), { okkey: "1.1.0" }, { okkey: "1.1.0" })).toBe(false);
    expect(shouldShowVersionDot(update("1.2.0"), { okkey: "1.1.0" }, { okkey: "1.1.0" })).toBe(true);
    expect(
      shouldShowVersionDot(
        [
          { component: "okkey", toVersion: "1.1.0" },
          { component: "enterprise", toVersion: "2.0.0" },
        ],
        { okkey: "1.1.0" },
        {},
      ),
    ).toBe(true);
  });
});
