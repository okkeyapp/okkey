import { beforeEach, describe, expect, it, vi } from "vitest";

const openStoredSplitKeyShareB = vi.fn(async () => new Uint8Array(32).fill(7));
const wrapSplitKeyShareB = vi.fn(async () => new Uint8Array([9, 9, 9, 9]));
const wipeBytes = vi.fn();

vi.mock("@okkey/crypto", () => ({
  classifySplitKeyShareBWire: (bytes: Uint8Array) => (bytes.length === 32 ? "legacy" : "hybrid"),
  openStoredSplitKeyShareB: (...args: unknown[]) => openStoredSplitKeyShareB(...args),
  wipeBytes: (bytes: Uint8Array) => wipeBytes(bytes),
  wrapSplitKeyShareB: (...args: unknown[]) => wrapSplitKeyShareB(...args),
}));

vi.mock("@okkey/vault", () => ({
  loadSplitKeyShareWrapKey: vi.fn(async () => ({
    ed25519Seed: new Uint8Array(32).fill(1),
    mlkemDecapsulationKey: new Uint8Array(8).fill(2),
  })),
}));

import { bytesToBase64 } from "./base64";
import { replacementDeviceShareForApproval } from "./approveDeviceShare";

const localShareB64 = bytesToBase64(new Uint8Array(32).fill(4));

describe("replacementDeviceShareForApproval", () => {
  beforeEach(() => {
    openStoredSplitKeyShareB.mockClear();
    wrapSplitKeyShareB.mockClear();
    wipeBytes.mockClear();
  });

  it("fails when the pending device has no wrap keys", async () => {
    await expect(
      replacementDeviceShareForApproval({
        userId: "user-1",
        localShareB64,
        pending: {},
      }),
    ).rejects.toThrow(/no share wrap keys/u);
    expect(openStoredSplitKeyShareB).not.toHaveBeenCalled();
    expect(wrapSplitKeyShareB).not.toHaveBeenCalled();
  });

  it("fails when only one wrap key is present", async () => {
    await expect(
      replacementDeviceShareForApproval({
        userId: "user-1",
        localShareB64,
        pending: { share_wrap_ed25519_public_key: bytesToBase64(new Uint8Array(32).fill(3)) },
      }),
    ).rejects.toThrow(/no share wrap keys/u);
    expect(wrapSplitKeyShareB).not.toHaveBeenCalled();
  });

  it("returns a wrapped share and does not return the opened share", async () => {
    const wrapped = await replacementDeviceShareForApproval({
      userId: "user-1",
      localShareB64,
      pending: {
        share_wrap_ed25519_public_key: bytesToBase64(new Uint8Array(32).fill(3)),
        share_wrap_pq_public_key: bytesToBase64(new Uint8Array(8).fill(5)),
      },
    });
    expect(wrapped).toBe(bytesToBase64(new Uint8Array([9, 9, 9, 9])));
    expect(wrapped).not.toBe(bytesToBase64(new Uint8Array(32).fill(7)));
    expect(wrapSplitKeyShareB).toHaveBeenCalledOnce();
    expect(wipeBytes).toHaveBeenCalled();
  });
});
