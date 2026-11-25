import { describe, expect, it } from "vitest";

import { formatSidebarVersionLabel, formatVersionWithCommitShas } from "./version-label";
import { shouldShowVersionDot } from "./visibility";

const FULL_SHA = "6e6ee86fac86b6fb1a6cc05da1f71d7e99d70560";
const SHORT_SHA = FULL_SHA.slice(0, 8);
const ENTERPRISE_SHA = "abcdef0123456789abcdef0123456789abcdef01";
const ENTERPRISE_SHORT = ENTERPRISE_SHA.slice(0, 8);

describe("sidebar version label", () => {
  it("shows a version without parentheses when the SHA is missing", () => {
    expect(formatSidebarVersionLabel({ version: "1.0.0-beta.3" })).toEqual({
      label: "v1.0.0-beta.3",
      tooltip: null,
      enterpriseTooltip: null,
    });
    expect(
      formatSidebarVersionLabel({
        version: "1.0.0-beta.3",
        releaseTag: "v1.0.0-beta.3",
        commitSha: null,
      }),
    ).toEqual({
      label: "v1.0.0-beta.3",
      tooltip: null,
      enterpriseTooltip: null,
    });
    expect(
      formatSidebarVersionLabel({
        version: "1.0.0-beta.3",
        commitSha: "   ",
      }),
    ).toEqual({
      label: "v1.0.0-beta.3",
      tooltip: null,
      enterpriseTooltip: null,
    });
  });

  it("appends the first 8 characters of the commit SHA when present", () => {
    expect(
      formatSidebarVersionLabel({
        version: "1.0.0-beta.3",
        commitSha: FULL_SHA,
      }),
    ).toEqual({
      label: `v1.0.0-beta.3 (${SHORT_SHA})`,
      tooltip: FULL_SHA,
      enterpriseTooltip: null,
    });
    expect(
      formatSidebarVersionLabel({
        version: "1.0.0-beta.3",
        releaseTag: "v1.0.0-beta.3",
        commitSha: FULL_SHA,
      }),
    ).toEqual({
      label: `v1.0.0-beta.3 (${SHORT_SHA})`,
      tooltip: FULL_SHA,
      enterpriseTooltip: null,
    });
    expect(
      formatSidebarVersionLabel({
        version: "0.0.0-dev",
        commitSha: FULL_SHA.toUpperCase(),
      }),
    ).toEqual({
      label: `v0.0.0-dev (${SHORT_SHA})`,
      tooltip: FULL_SHA,
      enterpriseTooltip: null,
    });
    expect(formatSidebarVersionLabel({ version: FULL_SHA })).toEqual({
      label: `v0.0.0-dev (${SHORT_SHA})`,
      tooltip: FULL_SHA,
      enterpriseTooltip: null,
    });
    expect(
      formatSidebarVersionLabel({
        version: `1.0.0-beta.3-${FULL_SHA}`,
      }),
    ).toEqual({
      label: `v1.0.0-beta.3 (${SHORT_SHA})`,
      tooltip: FULL_SHA,
      enterpriseTooltip: null,
    });
  });

  it("labels core and enterprise short SHAs when both are present", () => {
    expect(
      formatSidebarVersionLabel({
        version: "0.0.0-dev",
        commitSha: FULL_SHA,
        enterpriseCommitSha: ENTERPRISE_SHA,
      }),
    ).toEqual({
      label: `v0.0.0-dev (core ${SHORT_SHA} · enterprise ${ENTERPRISE_SHORT})`,
      tooltip: FULL_SHA,
      enterpriseTooltip: ENTERPRISE_SHA,
    });
  });

  it("keeps today's core-only label when the enterprise SHA is empty", () => {
    expect(
      formatSidebarVersionLabel({
        version: "0.0.0-dev",
        commitSha: FULL_SHA,
        enterpriseCommitSha: "  ",
      }),
    ).toEqual({
      label: `v0.0.0-dev (${SHORT_SHA})`,
      tooltip: FULL_SHA,
      enterpriseTooltip: null,
    });
  });
});

describe("formatVersionWithCommitShas", () => {
  it("keeps the version alone when no SHA is valid", () => {
    expect(formatVersionWithCommitShas({ version: "1.0.0" })).toBe("1.0.0");
    expect(formatVersionWithCommitShas({ version: "1.0.0", commitSha: "nope" })).toBe("1.0.0");
  });

  it("appends an unlabeled short SHA for core only", () => {
    expect(
      formatVersionWithCommitShas({
        version: "1.0.0-betta.3",
        commitSha: FULL_SHA,
        shortShaLen: 7,
      }),
    ).toBe("1.0.0-betta.3 (6e6ee86)");
  });

  it("labels both SHAs when enterprise is present", () => {
    expect(
      formatVersionWithCommitShas({
        version: "1.0.0-betta.3",
        commitSha: FULL_SHA,
        enterpriseCommitSha: ENTERPRISE_SHA,
        shortShaLen: 7,
      }),
    ).toBe("1.0.0-betta.3 (core 6e6ee86 · enterprise abcdef0)");
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
