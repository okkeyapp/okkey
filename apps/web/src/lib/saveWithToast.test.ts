import { describe, expect, it, vi } from "vitest";

import { runSaveWithToast } from "./saveWithToast";

vi.mock("sonner", () => ({
  toast: {
    promise: vi.fn(() => ({
      unwrap: vi.fn(async () => "created-item-id"),
    })),
  },
}));

describe("runSaveWithToast", () => {
  it("returns action result via toast.promise().unwrap()", async () => {
    const action = vi.fn(async () => "created-item-id");

    await expect(
      runSaveWithToast(
        {
          loading: "loading",
          success: "success",
          error: "error",
        },
        action,
      ),
    ).resolves.toBe("created-item-id");

    expect(action).toHaveBeenCalledOnce();
  });
});
