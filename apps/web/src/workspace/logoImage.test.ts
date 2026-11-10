import { describe, expect, it, vi } from "vitest";

import { assertWorkspaceLogoImage, commitWorkspaceLogoReplacement } from "./logoImage";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("workspace logo replacement", () => {
  it("accepts a png and rejects svg", () => {
    expect(() => assertWorkspaceLogoImage(PNG)).not.toThrow();
    expect(() => assertWorkspaceLogoImage(new TextEncoder().encode("<svg></svg>"))).toThrow(/png, jpeg, or webp/);
  });

  it("keeps the save when deleting the legacy attachment fails", async () => {
    const putCiphertext = vi.fn(async () => undefined);
    const deleteLegacy = vi.fn(async () => {
      throw new Error("Vault access denied");
    });
    await expect(
      commitWorkspaceLogoReplacement({
        ciphertext: PNG,
        putCiphertext,
        deleteLegacy,
      }),
    ).resolves.toBeUndefined();
    expect(putCiphertext).toHaveBeenCalledWith(PNG);
    expect(deleteLegacy).toHaveBeenCalledOnce();
  });
});
