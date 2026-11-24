import { describe, expect, it } from "vitest";

import { okkeyWorkspaceShellNavItems } from "@okkey/ui";

import passwordMonitoringModule from "@okkey-enterprise/monitoring";

import { mergePasswordMonitoringNavItem, visiblePasswordMonitoringPath } from "./nav";

describe("password monitoring module stub", () => {
  it("registers neither a screen nor a path", () => {
    expect(passwordMonitoringModule.MonitoringPage).toBeNull();
    expect(passwordMonitoringModule.monitoringPath).toBeNull();
    expect(
      passwordMonitoringModule.useMonitoringIssueItemIds({
        workspaceId: "workspace-1",
        filter: "weak",
      }),
    ).toBeUndefined();
  });

  it("leaves the default workspace nav without a monitoring row", () => {
    const items = okkeyWorkspaceShellNavItems(
      {
        items: "/items",
        capsules: "/capsules",
        tools: "/tools/generator",
        settings: "/settings/general",
      },
      {
        allItems: "All items",
        capsules: "Capsules",
        tools: "Tools",
        settings: "Settings",
      },
    );
    expect(items.map((item) => item.id)).toEqual(["all", "cap", "tools", "set"]);
    expect(items.some((item) => item.label === "Monitoring" || item.to === "/monitoring")).toBe(
      false,
    );
  });

  it("keeps the monitoring path visible when the plan feature is off", () => {
    expect(visiblePasswordMonitoringPath("/monitoring")).toBe("/monitoring");
    expect(visiblePasswordMonitoringPath(null)).toBeNull();
    expect(visiblePasswordMonitoringPath("")).toBeNull();

    const withModule = mergePasswordMonitoringNavItem(
      [{ id: "all" }, { id: "cap" }, { id: "tools" }],
      { id: "mon", to: visiblePasswordMonitoringPath("/monitoring")! },
    );
    expect(withModule.map((item) => item.id)).toEqual(["all", "cap", "mon", "tools"]);

    const withoutModule = mergePasswordMonitoringNavItem(
      [{ id: "all" }, { id: "cap" }, { id: "mon" }, { id: "tools" }],
      visiblePasswordMonitoringPath(null) ? { id: "mon" } : null,
    );
    expect(withoutModule.map((item) => item.id)).toEqual(["all", "cap", "tools"]);
  });
});
