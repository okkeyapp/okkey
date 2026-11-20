import { describe, expect, it, vi } from "vitest";

import { runSetupLogoUpload, setupLogoUploadDecision } from "./setupLogoUpload";

describe("setupLogoUploadDecision", () => {
  it("skips when no logo was selected", () => {
    expect(
      setupLogoUploadDecision({
        hadPendingLogo: false,
        unlockOk: true,
        hasVaultKey: true,
        hasPlaintext: true,
      }),
    ).toBe("skip");
  });

  it("fails when a logo was selected but the vault key was wiped", () => {
    expect(
      setupLogoUploadDecision({
        hadPendingLogo: true,
        unlockOk: true,
        hasVaultKey: false,
        hasPlaintext: true,
      }),
    ).toBe("fail");
  });

  it("fails when unlock failed after a logo was selected", () => {
    expect(
      setupLogoUploadDecision({
        hadPendingLogo: true,
        unlockOk: false,
        hasVaultKey: true,
        hasPlaintext: true,
      }),
    ).toBe("fail");
  });

  it("uploads when unlock succeeded and logo material is present", () => {
    expect(
      setupLogoUploadDecision({
        hadPendingLogo: true,
        unlockOk: true,
        hasVaultKey: true,
        hasPlaintext: true,
      }),
    ).toBe("upload");
  });
});

describe("runSetupLogoUpload", () => {
  it("calls upload with vault key and plaintext after a successful finish path", async () => {
    const vaultKey = new Uint8Array([1, 2, 3]);
    const plaintext = new Uint8Array([9, 8, 7]);
    const upload = vi.fn(async () => undefined);

    const result = await runSetupLogoUpload({
      decision: "upload",
      vaultKey,
      plaintext,
      upload,
    });

    expect(result).toBe("uploaded");
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith(vaultKey, plaintext);
  });

  it("returns failed without calling upload when materials were wiped", async () => {
    const upload = vi.fn(async () => undefined);
    const result = await runSetupLogoUpload({
      decision: "fail",
      vaultKey: null,
      plaintext: new Uint8Array([1]),
      upload,
    });
    expect(result).toBe("failed");
    expect(upload).not.toHaveBeenCalled();
  });

  it("returns failed when upload throws", async () => {
    const result = await runSetupLogoUpload({
      decision: "upload",
      vaultKey: new Uint8Array([1]),
      plaintext: new Uint8Array([2]),
      upload: async () => {
        throw new Error("put failed");
      },
    });
    expect(result).toBe("failed");
  });
});
