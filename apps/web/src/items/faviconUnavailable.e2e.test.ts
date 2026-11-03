/**
 * End-to-end (web): live HTTP `/favicon/preview` → real `previewItemFavicon`
 * (not mocked) → `lookupWebsiteFaviconFromNetwork`.
 *
 * Proves 503 FAVICON_UNAVAILABLE keeps the previous icon semantics (`unavailable`),
 * while 404 remains a positive absence.
 */
import type { ItemPlaintextV2 } from "@okkey/types";
import { ITEM_CATEGORY_LOGIN } from "@okkey/types";
import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/key-field-files", () => ({
  uploadEncryptedAttachment: vi.fn(),
  downloadKeyFieldFileAttachmentBytes: vi.fn(),
}));

vi.mock("../lib/resizeFaviconImage", () => ({
  normalizeFaviconImageBytesToPng: vi.fn(async (bytes: Uint8Array) => bytes),
}));

// Intentionally NOT mocking ../api/item-favicons — exercise the real client.

import * as keyFieldFilesApi from "../api/key-field-files";
import { FaviconPreviewUnavailableError, previewItemFavicon } from "../api/item-favicons";
import { lookupWebsiteFaviconFromNetwork } from "./syncItemFavicon";

function loginWithUrl(url: string, overrides: Partial<ItemPlaintextV2> = {}): ItemPlaintextV2 {
  return {
    schemaVersion: 2,
    itemId: "1000000000000000001",
    vaultId: "1000000000000000002",
    title: "Example",
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
        label: "Website",
        value: { kind: "url", url },
      },
    ],
    ...overrides,
  };
}

type PreviewMode = "unavailable" | "absent" | "found" | "hang";

async function startPreviewServer(mode: PreviewMode): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const icon = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/favicon/preview") {
      res.statusCode = 404;
      res.end();
      return;
    }
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "UNAUTHORIZED" }));
      return;
    }

    if (mode === "hang") {
      // Never respond — client timeout must win.
      return;
    }

    if (mode === "unavailable") {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "FAVICON_UNAVAILABLE",
          message: "Website unreachable; favicon temporarily unavailable",
        }),
      );
      return;
    }

    if (mode === "absent") {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "NOT_FOUND", message: "Favicon not found" }));
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "image/png");
    res.end(Buffer.from(icon));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to start web favicon e2e server");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      // Hung preview requests keep sockets open; drop them so close() can finish.
      if (typeof server.closeAllConnections === "function") {
        server.closeAllConnections();
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

describe("favicon unavailable e2e (server→client, no previewItemFavicon mock)", () => {
  afterEach(() => {
    delete window.__OKKEY_RUNTIME__;
    vi.mocked(keyFieldFilesApi.uploadEncryptedAttachment).mockReset();
  });

  it("maps 503 FAVICON_UNAVAILABLE to lookup unavailable (keeps icon)", async () => {
    const server = await startPreviewServer("unavailable");
    window.__OKKEY_RUNTIME__ = { apiBaseUrl: server.baseUrl };
    try {
      await expect(previewItemFavicon("token", ["https://down.example.com"])).rejects.toBeInstanceOf(
        FaviconPreviewUnavailableError,
      );

      const result = await lookupWebsiteFaviconFromNetwork(
        "token",
        new Uint8Array([1]),
        loginWithUrl("https://down.example.com", {
          faviconId: "1000000000000000099",
          faviconSource: "website",
        }),
      );
      expect(result).toEqual({ status: "unavailable" });
      expect(keyFieldFilesApi.uploadEncryptedAttachment).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  it("maps 404 to lookup absent (positive no icon)", async () => {
    const server = await startPreviewServer("absent");
    window.__OKKEY_RUNTIME__ = { apiBaseUrl: server.baseUrl };
    try {
      await expect(previewItemFavicon("token", ["https://no-icon.example.com"])).resolves.toBeNull();

      const result = await lookupWebsiteFaviconFromNetwork(
        "token",
        new Uint8Array([1]),
        loginWithUrl("https://no-icon.example.com"),
      );
      expect(result).toEqual({ status: "absent" });
    } finally {
      await server.close();
    }
  });

  it("maps 200 image to lookup found", async () => {
    vi.mocked(keyFieldFilesApi.uploadEncryptedAttachment).mockResolvedValue({
      attachmentId: "1000000000000000015",
      name: "favicon.png",
      mimeType: "image/png",
      sizeBytes: 8,
    });

    const server = await startPreviewServer("found");
    window.__OKKEY_RUNTIME__ = { apiBaseUrl: server.baseUrl };
    try {
      const blob = await previewItemFavicon("token", ["https://has-icon.example.com"]);
      expect(blob).toBeTruthy();
      expect(blob!.size).toBeGreaterThan(0);

      const result = await lookupWebsiteFaviconFromNetwork(
        "token",
        new Uint8Array([1]),
        loginWithUrl("https://has-icon.example.com"),
      );
      expect(keyFieldFilesApi.uploadEncryptedAttachment).toHaveBeenCalled();
      expect(result.status).toBe("found");
      if (result.status === "found") {
        expect(result.sync.item.faviconId).toBe("1000000000000000015");
      }
    } finally {
      await server.close();
    }
  });

  it(
    "client timeout on hung preview returns unavailable",
    async () => {
      const server = await startPreviewServer("hang");
      window.__OKKEY_RUNTIME__ = { apiBaseUrl: server.baseUrl };
      try {
        const started = Date.now();
        const result = await lookupWebsiteFaviconFromNetwork(
          "token",
          new Uint8Array([1]),
          loginWithUrl("https://slow.example.com", {
            faviconId: "1000000000000000099",
            faviconSource: "website",
          }),
          { timeoutMs: 80 },
        );
        expect(Date.now() - started).toBeLessThan(3_000);
        expect(result).toEqual({ status: "unavailable" });
      } finally {
        await server.close();
      }
    },
    10_000,
  );
});
