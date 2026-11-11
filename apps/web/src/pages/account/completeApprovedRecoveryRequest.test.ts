import { ApiRequestError } from "@okkey/api";
import { describe, expect, it, vi } from "vitest";

import {
  approvedRecoveryCompletePath,
  completeApprovedRecoveryRequest,
} from "./completeApprovedRecoveryRequest";

describe("completeApprovedRecoveryRequest", () => {
  it("builds the device and contact complete paths", () => {
    expect(approvedRecoveryCompletePath("devices", "req/1")).toBe(
      "/enterprise/account/recovery/devices/requests/req%2F1/complete",
    );
    expect(approvedRecoveryCompletePath("contacts", "req 2")).toBe(
      "/enterprise/account/recovery/contacts/requests/req%202/complete",
    );
  });

  it("ignores a missing plugin and a blank request id", async () => {
    const post = vi.fn(async () => {
      throw new ApiRequestError(404, {
        error: "NOT_FOUND",
        message: "missing",
        requestId: "r",
      });
    });

    await expect(completeApprovedRecoveryRequest({ post }, "devices", "  ")).resolves.toBe(
      "absent",
    );
    expect(post).not.toHaveBeenCalled();

    await expect(completeApprovedRecoveryRequest({ post }, "contacts", "abc")).resolves.toBe(
      "absent",
    );
    expect(post).toHaveBeenCalledWith(
      "/enterprise/account/recovery/contacts/requests/abc/complete",
      {},
    );
  });

  it("accepts an empty success body and rethrows other failures", async () => {
    const empty = vi.fn(async () => {
      throw new SyntaxError("empty API response body");
    });
    await expect(completeApprovedRecoveryRequest({ post: empty }, "devices", "id")).resolves.toBe(
      "completed",
    );

    const denied = vi.fn(async () => {
      throw new ApiRequestError(401, {
        error: "AUTH_REQUIRED",
        message: "auth required",
        requestId: "r",
      });
    });
    await expect(completeApprovedRecoveryRequest({ post: denied }, "devices", "id")).rejects.toMatchObject(
      { status: 401 },
    );
  });
});
