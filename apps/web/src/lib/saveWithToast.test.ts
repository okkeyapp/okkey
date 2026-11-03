import { describe, expect, it, vi } from "vitest";

import {
  formatSaveError,
  isInternalSaveErrorMessage,
  isItemUpdateConflictError,
  runSaveWithToast,
} from "./saveWithToast";

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

describe("formatSaveError", () => {
  it("maps OUTBOX_ENTRY_NOT_APPENDED codes to the human fallback", () => {
    expect(formatSaveError(new Error("OUTBOX_ENTRY_NOT_APPENDED:UNKNOWN"), "Couldn't save")).toBe(
      "Couldn't save",
    );
    expect(formatSaveError(new Error("OUTBOX_ENTRY_NOT_APPENDED"), "Couldn't save")).toBe(
      "Couldn't save",
    );
  });

  it("maps ITEM_UPDATE_CONFLICT to the conflict message", () => {
    expect(
      formatSaveError(
        new Error("OUTBOX_ENTRY_NOT_APPENDED:ITEM_UPDATE_CONFLICT"),
        "Couldn't save",
        "Changed elsewhere",
      ),
    ).toBe("Changed elsewhere");
    expect(isItemUpdateConflictError(new Error("ITEM_UPDATE_CONFLICT"))).toBe(true);
  });

  it("keeps non-internal Error messages", () => {
    expect(formatSaveError(new Error("Network offline"), "Couldn't save")).toBe("Network offline");
  });

  it("treats SCREAMING_SNAKE codes as internal", () => {
    expect(isInternalSaveErrorMessage("AUTH_REQUIRED")).toBe(true);
    expect(isInternalSaveErrorMessage("hello world")).toBe(false);
  });
});
