import { describe, expect, it } from "vitest";

import {
  DEFAULT_TOOLS_SECTION,
  TOOLS_GENERATOR_PATH,
  TOOLS_PATH,
  isToolsPathname,
  isWorkspaceAppShellPathname,
  toolsPath,
  toolsSectionFromPathname,
  toolsSectionFromSlug,
} from "./paths";

describe("tools paths", () => {
  it("maps sections to nested URLs like settings", () => {
    expect(DEFAULT_TOOLS_SECTION).toBe("generator");
    expect(toolsPath()).toBe("/tools/generator");
    expect(toolsPath("import")).toBe("/tools/import");
    expect(toolsPath("export")).toBe("/tools/export");
    expect(TOOLS_GENERATOR_PATH).toBe("/tools/generator");
  });

  it("parses section slugs and pathnames", () => {
    expect(toolsSectionFromSlug("generator")).toBe("generator");
    expect(toolsSectionFromSlug("unknown")).toBeNull();
    expect(toolsSectionFromPathname(TOOLS_PATH)).toBeNull();
    expect(toolsSectionFromPathname("/tools/import")).toBe("import");
    expect(toolsSectionFromPathname("/tools/export/extra")).toBe("export");
    expect(toolsSectionFromPathname("/settings/main")).toBeNull();
  });

  it("treats nested tool URLs as workspace shell paths", () => {
    expect(isToolsPathname("/tools")).toBe(true);
    expect(isToolsPathname("/tools/generator")).toBe(true);
    expect(isToolsPathname("/settings")).toBe(false);
    expect(isWorkspaceAppShellPathname("/tools/import")).toBe(true);
  });
});
