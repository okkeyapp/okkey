import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applySystemUpdate } from "./applySystemUpdate";

describe("applySystemUpdate", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 501,
        json: async () => ({
          error: "UPDATE_APPLY_UNAVAILABLE",
          message: "Update agent is not configured",
          applied: false,
        }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps 501 UPDATE_APPLY_UNAVAILABLE", async () => {
    const result = await applySystemUpdate();
    expect(result).toEqual({
      ok: false,
      error: "UPDATE_APPLY_UNAVAILABLE",
      message: "Update agent is not configured",
    });
  });
});
