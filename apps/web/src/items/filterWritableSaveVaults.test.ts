import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Vault } from "@okkey/types";

const sharedAllowed = vi.fn(() => false);

vi.mock("../workspace/planEntitlements", () => ({
  workspaceHasPlanFeature: (_workspace: unknown, feature: string) => {
    if (feature === "sharedVaults") {
      return sharedAllowed();
    }
    return false;
  },
}));

import { filterWritableSaveVaults } from "./filterWritableSaveVaults";

function mkVault(id: string, isPersonal: boolean): Vault {
  return {
    id,
    workspaceId: "w1",
    name: id,
    description: "",
    icon: "🏠",
    isPersonal,
    ownerId: "u1",
    cryptoVersion: 2,
    createdAt: "",
    updatedAt: "",
  } as Vault;
}

describe("filterWritableSaveVaults", () => {
  beforeEach(() => {
    sharedAllowed.mockReturnValue(false);
  });

  it("hides shared vaults on FREE when creating", () => {
    const vaults = [mkVault("personal", true), mkVault("shared", false)];
    expect(filterWritableSaveVaults(vaults, () => true).map((v) => v.id)).toEqual(["personal"]);
  });

  it("keeps current shared vault when editing", () => {
    const vaults = [mkVault("personal", true), mkVault("shared", false), mkVault("other", false)];
    expect(
      filterWritableSaveVaults(vaults, () => true, "shared")
        .map((v) => v.id)
        .sort(),
    ).toEqual(["personal", "shared"]);
  });

  it("includes shared vaults when plan allows", () => {
    sharedAllowed.mockReturnValue(true);
    const vaults = [mkVault("personal", true), mkVault("shared", false)];
    expect(
      filterWritableSaveVaults(vaults, () => true)
        .map((v) => v.id)
        .sort(),
    ).toEqual(["personal", "shared"]);
  });
});
