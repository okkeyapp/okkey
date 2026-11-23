import { describe, expect, it } from "vitest";

import { resolveCurrentWorkspaceId } from "./resolveCurrentWorkspaceId";

describe("resolveCurrentWorkspaceId", () => {
  it("prefers a stored/query candidate the user still belongs to", () => {
    expect(
      resolveCurrentWorkspaceId({
        memberships: [{ id: "a" }, { id: "b" }],
        preferredId: "b",
      }),
    ).toBe("b");
  });

  it("ignores a preferred id that is not a membership", () => {
    expect(
      resolveCurrentWorkspaceId({
        memberships: [{ id: "a" }, { id: "b" }],
        preferredId: "gone",
      }),
    ).toBe("a");
  });

  it("uses the only membership when nothing is preferred", () => {
    expect(
      resolveCurrentWorkspaceId({
        memberships: [{ id: "solo" }],
        preferredId: null,
      }),
    ).toBe("solo");
  });

  it("falls back to the first membership when several exist and none preferred", () => {
    expect(
      resolveCurrentWorkspaceId({
        memberships: [{ id: "personal" }, { id: "invited" }],
      }),
    ).toBe("personal");
  });

  it("returns null when the user has no memberships", () => {
    expect(resolveCurrentWorkspaceId({ memberships: [] })).toBeNull();
  });
});
