import { describe, expect, it, vi } from "vitest";

import {
  capturePendingLogoForFinish,
  runSetupLogoUpload,
  setupLogoUploadDecision,
  shouldWipeLogoMaterialsOnUnmount,
} from "./setupLogoUpload";

describe("setupLogoUploadDecision", () => {
  it("skips when no logo was selected", () => {
    expect(
      setupLogoUploadDecision({
        hadPendingLogo: false,
        hasVaultKey: true,
        hasPlaintext: true,
      }),
    ).toBe("skip");
  });

  it("fails when a logo was selected but the vault key was wiped", () => {
    expect(
      setupLogoUploadDecision({
        hadPendingLogo: true,
        hasVaultKey: false,
        hasPlaintext: true,
      }),
    ).toBe("fail");
  });

  it("fails when plaintext is missing after a logo was selected", () => {
    expect(
      setupLogoUploadDecision({
        hadPendingLogo: true,
        hasVaultKey: true,
        hasPlaintext: false,
      }),
    ).toBe("fail");
  });

  it("uploads when in-memory logo material is present (no vault unlock required)", () => {
    expect(
      setupLogoUploadDecision({
        hadPendingLogo: true,
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

describe("capturePendingLogoForFinish vs unmount wipe", () => {
  it("keeps upload materials when refs are wiped after session apply (finish order)", async () => {
    const refs = {
      vaultKey: new Uint8Array([1, 2, 3]) as Uint8Array | null,
      plaintext: new Uint8Array([9, 8, 7]) as Uint8Array | null,
    };
    // 1) Capture before flushSync(applyAccessTokenResponse).
    const captured = capturePendingLogoForFinish(refs);
    expect(captured.hadPendingLogo).toBe(true);

    // 2) GuestAuthOnly unmounts /setup; cleanup would wipe refs when finishInFlight is false.
    expect(shouldWipeLogoMaterialsOnUnmount(true)).toBe(false);
    expect(shouldWipeLogoMaterialsOnUnmount(false)).toBe(true);
    refs.vaultKey = null;
    refs.plaintext = null;

    // 3) Decision / upload must use captured locals, not wiped refs.
    const decision = setupLogoUploadDecision({
      hadPendingLogo: captured.hadPendingLogo,
      hasVaultKey: Boolean(captured.vaultKey),
      hasPlaintext: Boolean(captured.plaintext),
    });
    expect(decision).toBe("upload");

    const upload = vi.fn(async () => undefined);
    const outcome = await runSetupLogoUpload({
      decision,
      vaultKey: captured.vaultKey,
      plaintext: captured.plaintext,
      upload,
    });
    expect(outcome).toBe("uploaded");
    expect(upload).toHaveBeenCalledWith(captured.vaultKey, captured.plaintext);

    // Without capture, wiped refs fail (the pre-fix bug).
    expect(
      setupLogoUploadDecision({
        hadPendingLogo: true,
        hasVaultKey: Boolean(refs.vaultKey),
        hasPlaintext: Boolean(refs.plaintext),
      }),
    ).toBe("fail");
  });
});
