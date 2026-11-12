import { describe, expect, it } from "vitest";

import { FaviconImageNormalizeError } from "./faviconImageError";
import { decodePngRgba, encodeRgbaPng, readPngDimensions } from "./faviconPng";
import { sanitizeSvgMarkup } from "./faviconSvg";
import {
  FAVICON_IMAGE_SIZE_PX,
  FAVICON_MIN_SIZE_PX,
  isAcceptedFaviconImageFile,
  normalizeFaviconImageBytesToPng,
} from "./resizeFaviconImage";

function solidRgba(width: number, height: number, rgba: [number, number, number, number]): Uint8Array {
  const bytes = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    bytes.set(rgba, i * 4);
  }
  return bytes;
}

async function solidPng(size: number, rgba: [number, number, number, number] = [220, 20, 40, 255]): Promise<Uint8Array> {
  return encodeRgbaPng(size, size, solidRgba(size, size, rgba));
}

function pngIhdr(bytes: Uint8Array): { width: number; height: number } {
  const dimensions = readPngDimensions(bytes);
  expect(dimensions).not.toBeNull();
  return dimensions!;
}

function findAscii(bytes: Uint8Array, text: string): number {
  const needle = Array.from(text).map((char) => char.charCodeAt(0));
  for (let index = 0; index <= bytes.byteLength - needle.length; index += 1) {
    if (needle.every((value, offset) => bytes[index + offset] === value)) {
      return index;
    }
  }
  return -1;
}

describe("resizeFaviconImage", () => {
  it("accepts jpg and png mime types", () => {
    expect(isAcceptedFaviconImageFile(new File(["x"], "icon.png", { type: "image/png" }))).toBe(true);
    expect(isAcceptedFaviconImageFile(new File(["x"], "icon.jpg", { type: "image/jpeg" }))).toBe(true);
    expect(isAcceptedFaviconImageFile(new File(["x"], "icon.gif", { type: "image/gif" }))).toBe(false);
  });

  it("exports favicon size constants meeting the 60px minimum", () => {
    expect(FAVICON_IMAGE_SIZE_PX).toBe(80);
    expect(FAVICON_MIN_SIZE_PX).toBe(60);
    expect(FAVICON_IMAGE_SIZE_PX).toBeGreaterThanOrEqual(FAVICON_MIN_SIZE_PX);
  });
});

describe("normalizeFaviconImageBytesToPng", () => {
  it.each([16, 32, 59, 60, 512])("normalizes a %ipx PNG to an 80x80 PNG", async (size) => {
    const source = await solidPng(size);
    const normalized = await normalizeFaviconImageBytesToPng(source);
    expect(Array.from(normalized.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(pngIhdr(normalized)).toEqual({ width: 80, height: 80 });
    if (size === 512) {
      expect(normalized.byteLength).toBeLessThan(source.byteLength);
    }
    const idatAt = findAscii(normalized, "IDAT");
    expect(idatAt).toBeGreaterThan(0);
    expect(normalized[idatAt + 4]).toBe(0x78);
    const decoded = await decodePngRgba(normalized);
    const center = (40 * 80 + 40) * 4;
    expect(decoded.rgba[center]).toBeGreaterThan(200);
    expect(decoded.rgba[center + 3]).toBe(255);
  });

  it("rejects a PNG whose header claims an enormous edge", async () => {
    const bytes = new Uint8Array(64);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    view.setUint32(16, 9000);
    view.setUint32(20, 9000);
    bytes[24] = 8;
    bytes[25] = 6;
    await expect(normalizeFaviconImageBytesToPng(bytes)).rejects.toBeInstanceOf(FaviconImageNormalizeError);
  });

  it("upscales a PNG embedded in an ICO instead of storing the container", async () => {
    const png = await solidPng(16, [10, 20, 30, 255]);
    const ico = new Uint8Array(6 + 16 + png.byteLength);
    ico[2] = 1;
    ico[4] = 1;
    ico[6] = 16;
    ico[7] = 16;
    const view = new DataView(ico.buffer);
    view.setUint32(14, png.byteLength, true);
    view.setUint32(18, 22, true);
    ico.set(png, 22);
    const normalized = await normalizeFaviconImageBytesToPng(ico);
    expect(pngIhdr(normalized)).toEqual({ width: 80, height: 80 });
  });

  it("strips script and event handlers from SVG and does not store the raw document", async () => {
    const svg = `<?xml version="1.0"?>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" onload="globalThis.__okkeySvgRan=true">
        <script>globalThis.__okkeySvgRan=true</script>
        <foreignObject><body xmlns="http://www.w3.org/1999/xhtml"></body></foreignObject>
        <rect width="16" height="16" fill="red"/>
      </svg>`;
    const sanitized = sanitizeSvgMarkup(svg);
    expect(sanitized.toLowerCase()).not.toContain("<script");
    expect(sanitized.toLowerCase()).not.toContain("onload");
    expect(sanitized.toLowerCase()).not.toContain("foreignobject");
    expect(sanitized).toContain("<rect");
    expect((globalThis as { __okkeySvgRan?: boolean }).__okkeySvgRan).toBeUndefined();

    const normalizedPromise = normalizeFaviconImageBytesToPng(new TextEncoder().encode(svg));
    await expect(normalizedPromise).rejects.toMatchObject({
      name: "FaviconImageNormalizeError",
      code: "CANVAS_UNAVAILABLE",
    });
  });
});
