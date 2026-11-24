import type { ItemPlaintextV2 } from "@okkey/types";
import { ITEM_CATEGORY_LOGIN } from "@okkey/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { encodeRgbaPng, readPngDimensions } from "../lib/faviconPng";
import { FAVICON_IMAGE_SIZE_PX } from "../lib/resizeFaviconImage";

vi.mock("../api/key-field-files", () => ({
  uploadEncryptedAttachment: vi.fn(),
  downloadKeyFieldFileAttachmentBytes: vi.fn(),
}));

vi.mock("../api/item-favicons", () => ({
  previewItemFavicon: vi.fn(),
}));

import * as itemFaviconsApi from "../api/item-favicons";
import * as keyFieldFilesApi from "../api/key-field-files";
import { lookupWebsiteFaviconFromNetwork } from "./syncItemFavicon";

function solidPng(size: number): Promise<Uint8Array> {
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    rgba.set([12, 80, 160, 255], i * 4);
  }
  return encodeRgbaPng(size, size, rgba);
}

function loginWithUrl(url: string): ItemPlaintextV2 {
  return {
    schemaVersion: 2,
    itemId: "1000000000000000001",
    vaultId: "1000000000000000002",
    title: "Example Bank",
    categoryId: ITEM_CATEGORY_LOGIN,
    createdAtMs: 1,
    updatedAtMs: 1,
    sections: [],
    fields: [
      {
        id: "f1",
        type: "url",
        sectionId: "websites",
        order: 0,
        label: "website URL",
        value: { kind: "url", url },
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetched favicon bytes are stored as 80x80 PNG", () => {
  it.each([16, 32, 59, 60, 512])("does not store a %ipx icon whole", async (size) => {
    const source = await solidPng(size);
    vi.mocked(itemFaviconsApi.previewItemFavicon).mockResolvedValue({
      arrayBuffer: async () => source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
    } as Blob);
    vi.mocked(keyFieldFilesApi.uploadEncryptedAttachment).mockResolvedValue({
      attachmentId: "1000000000000000099",
      name: "favicon.png",
      mimeType: "image/png",
      sizeBytes: 80,
    });

    const result = await lookupWebsiteFaviconFromNetwork("token", new Uint8Array([1]), loginWithUrl("https://example.com"));
    expect(result.status).toBe("found");
    const plaintext = vi.mocked(keyFieldFilesApi.uploadEncryptedAttachment).mock.calls[0]?.[0]?.plaintext;
    expect(plaintext).toBeInstanceOf(Uint8Array);
    expect(readPngDimensions(plaintext as Uint8Array)).toEqual({
      width: FAVICON_IMAGE_SIZE_PX,
      height: FAVICON_IMAGE_SIZE_PX,
    });
    if (size !== FAVICON_IMAGE_SIZE_PX) {
      expect((plaintext as Uint8Array).byteLength).not.toBe(source.byteLength);
    }
  });
});
