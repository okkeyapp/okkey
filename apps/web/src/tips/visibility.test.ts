import { describe, expect, it } from "vitest";

import {
  mayFetchServerMailForTips,
  shouldIncludeServerEmailTip,
  visibleSidebarTips,
  type SidebarTipsVisibilityInput,
} from "./visibility";

function base(overrides: Partial<SidebarTipsVisibilityInput> = {}): SidebarTipsVisibilityInput {
  return {
    dismissed: false,
    pinEnabled: false,
    twoFactorEnabled: false,
    lockOnDeviceSleep: false,
    deploymentMode: "self_hosted",
    isWorkspaceOwner: true,
    smtpActive: false,
    ...overrides,
  };
}

describe("visibleSidebarTips", () => {
  it("returns all unfinished tips for owner on self-host with inactive SMTP", () => {
    expect(visibleSidebarTips(base())).toEqual([
      "setupPin",
      "enableTwoFactor",
      "lockOnDeviceLock",
      "serverEmail",
    ]);
  });

  it("hides the banner entirely when dismissed", () => {
    expect(visibleSidebarTips(base({ dismissed: true }))).toEqual([]);
  });

  it("omits completed device and 2FA tips", () => {
    expect(
      visibleSidebarTips(
        base({
          pinEnabled: true,
          twoFactorEnabled: true,
          lockOnDeviceSleep: true,
          smtpActive: false,
        }),
      ),
    ).toEqual(["serverEmail"]);
  });

  it("omits server email when SMTP is active", () => {
    expect(visibleSidebarTips(base({ smtpActive: true }))).toEqual([
      "setupPin",
      "enableTwoFactor",
      "lockOnDeviceLock",
    ]);
  });

  it("omits server email while SMTP status is unknown", () => {
    expect(visibleSidebarTips(base({ smtpActive: null }))).toEqual([
      "setupPin",
      "enableTwoFactor",
      "lockOnDeviceLock",
    ]);
  });

  it("omits server email for non-owners even when SMTP is inactive", () => {
    expect(visibleSidebarTips(base({ isWorkspaceOwner: false, smtpActive: false }))).toEqual([
      "setupPin",
      "enableTwoFactor",
      "lockOnDeviceLock",
    ]);
  });

  it("omits server email on SaaS even for owners", () => {
    expect(
      visibleSidebarTips(
        base({
          deploymentMode: "saas",
          isWorkspaceOwner: true,
          smtpActive: false,
        }),
      ),
    ).toEqual(["setupPin", "enableTwoFactor", "lockOnDeviceLock"]);
  });

  it("returns empty when every tip is complete", () => {
    expect(
      visibleSidebarTips(
        base({
          pinEnabled: true,
          twoFactorEnabled: true,
          lockOnDeviceSleep: true,
          smtpActive: true,
        }),
      ),
    ).toEqual([]);
  });
});

describe("shouldIncludeServerEmailTip / mayFetchServerMailForTips", () => {
  it("includes server email only for owner + self-host + smtp inactive", () => {
    expect(
      shouldIncludeServerEmailTip({
        deploymentMode: "self_hosted",
        isWorkspaceOwner: true,
        smtpActive: false,
      }),
    ).toBe(true);
    expect(
      shouldIncludeServerEmailTip({
        deploymentMode: "self_hosted",
        isWorkspaceOwner: false,
        smtpActive: false,
      }),
    ).toBe(false);
    expect(
      shouldIncludeServerEmailTip({
        deploymentMode: "saas",
        isWorkspaceOwner: true,
        smtpActive: false,
      }),
    ).toBe(false);
    expect(
      shouldIncludeServerEmailTip({
        deploymentMode: "self_hosted",
        isWorkspaceOwner: true,
        smtpActive: true,
      }),
    ).toBe(false);
    expect(
      shouldIncludeServerEmailTip({
        deploymentMode: "self_hosted",
        isWorkspaceOwner: true,
        smtpActive: null,
      }),
    ).toBe(false);
  });

  it("allows fetching server mail settings only for owner on self-host", () => {
    expect(mayFetchServerMailForTips({ deploymentMode: "self_hosted", isWorkspaceOwner: true })).toBe(
      true,
    );
    expect(
      mayFetchServerMailForTips({ deploymentMode: "self_hosted", isWorkspaceOwner: false }),
    ).toBe(false);
    expect(mayFetchServerMailForTips({ deploymentMode: "saas", isWorkspaceOwner: true })).toBe(false);
  });
});
