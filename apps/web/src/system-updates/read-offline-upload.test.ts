import { describe, expect, it } from "vitest";

import { readOfflineUpload } from "./read-offline-upload";

/** jsdom's File/Blob does not implement `.text()` or `.arrayBuffer()`. */
function fileFromBytes(bytes: Uint8Array, name: string, type: string): File {
  const file = new File([bytes], name, { type });
  const copy = bytes.slice();
  if (typeof file.text !== "function") {
    Object.defineProperty(file, "text", {
      value: async () => new TextDecoder().decode(copy),
    });
  }
  if (typeof file.arrayBuffer !== "function") {
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength),
    });
  }
  return file;
}

describe("offline upload", () => {
  it("keeps a JSON bundle document for the apply call", async () => {
    const document = {
      format: "okkey-offline-bundle",
      formatVersion: 1,
      archiveBase64: "AAAA",
    };
    const file = fileFromBytes(
      new TextEncoder().encode(JSON.stringify(document)),
      "release.okbundle",
      "application/json",
    );
    await expect(readOfflineUpload(file)).resolves.toEqual(document);
  });

  it("wraps a zip archive so the apply call can verify it", async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);
    const file = fileFromBytes(bytes, "release.zip", "application/zip");
    const document = (await readOfflineUpload(file)) as { format: string; archiveBase64: string };
    expect(document.format).toBe("okkey-offline-bundle");
    expect(document.archiveBase64).toBe(btoa("PK\u0003\u0004\u0000"));
  });
});
