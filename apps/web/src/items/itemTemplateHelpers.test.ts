import { describe, expect, it, vi, beforeEach } from "vitest";

import * as itemFaviconsApi from "../api/item-favicons";
import * as keyFieldFilesApi from "../api/key-field-files";
import type { KeyFormEditorSection } from "../components/key-form/KeyFormEditor";
import { syncTemplateFaviconForSnapshot } from "./itemTemplateHelpers";

function snapshot(sections: KeyFormEditorSection[] = []) {
  return {
    categoryId: "login",
    recordName: "Example",
    vaultId: "1000000000000000001",
    folderId: "none",
    sections,
    tags: [],
  };
}

function websitesSection(url: string): KeyFormEditorSection {
  return {
    id: "websites",
    variant: "primary",
    fields: [
      {
        id: "website",
        type: "url",
        label: "Website",
        value: url,
      },
    ],
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("syncTemplateFaviconForSnapshot", () => {
  it("uploads website favicon preview as an encrypted template attachment", async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    vi.spyOn(itemFaviconsApi, "previewItemFavicon").mockResolvedValue({
      arrayBuffer: async () => pngBytes.buffer,
    } as Blob);
    const upload = vi.spyOn(keyFieldFilesApi, "uploadEncryptedAttachment").mockResolvedValue({
      attachmentId: "1000000000000000003",
      name: "favicon.png",
      mimeType: "image/png",
      sizeBytes: pngBytes.byteLength,
    });
    const vaultKey = new Uint8Array([1, 2, 3]);

    const synced = await syncTemplateFaviconForSnapshot(
      "token",
      vaultKey,
      "1000000000000000002",
      snapshot([websitesSection("https://example.com")]),
    );

    expect(upload).toHaveBeenCalledWith({
      accessToken: "token",
      vaultId: "1000000000000000001",
      itemId: "1000000000000000002",
      vaultKey,
      plaintext: pngBytes,
      name: "favicon.png",
      mimeType: "image/png",
      sizeBytes: pngBytes.byteLength,
    });
    expect(synced.faviconId).toBe("1000000000000000003");
    expect(synced.faviconSource).toBe("website");
  });

  it("copies reused manual favicon into the new template attachment scope", async () => {
    const pngBytes = new Uint8Array([1, 2, 3, 4]);
    vi.spyOn(keyFieldFilesApi, "downloadKeyFieldFileAttachmentBytes").mockResolvedValue({
      plaintext: pngBytes,
      name: "favicon.png",
      mimeType: "image/png",
      sizeBytes: pngBytes.byteLength,
    });
    vi.spyOn(keyFieldFilesApi, "uploadEncryptedAttachment").mockResolvedValue({
      attachmentId: "1000000000000000005",
      name: "favicon.png",
      mimeType: "image/png",
      sizeBytes: pngBytes.byteLength,
    });

    const synced = await syncTemplateFaviconForSnapshot(
      "token",
      new Uint8Array([1]),
      "1000000000000000002",
      snapshot(),
      {
        faviconSource: "manual",
        reuseFaviconId: "1000000000000000004",
        reuseFaviconItemId: "1000000000000000003",
      },
    );

    expect(synced.faviconId).toBe("1000000000000000005");
    expect(synced.faviconSource).toBe("manual");
    expect(synced.uploadedFavicon?.attachmentId).toBe("1000000000000000005");
  });
});
