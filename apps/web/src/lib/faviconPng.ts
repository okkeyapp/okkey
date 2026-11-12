import { FaviconImageNormalizeError } from "./faviconImageError";

/**
 * Reject rasters whose header claims an edge this large before allocating a bitmap.
 * 512px icons are downscaled; this only stops decompression bombs.
 */
export const FAVICON_MAX_SOURCE_EDGE_PX = 8192;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export function isPngBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PNG_SIGNATURE.length) {
    return false;
  }
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function assertEdge(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > FAVICON_MAX_SOURCE_EDGE_PX ||
    height > FAVICON_MAX_SOURCE_EDGE_PX
  ) {
    throw new FaviconImageNormalizeError("IMAGE_DIMENSIONS");
  }
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0;
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16) |
    ((bytes[offset + 3] ?? 0) << 24)
  ) >>> 0;
}

function readInt32LE(bytes: Uint8Array, offset: number): number {
  const value = readUint32LE(bytes, offset);
  return value > 0x7fffffff ? value - 0x100000000 : value;
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

/** PNG IHDR size, or null when the buffer is not a PNG with an IHDR chunk. */
export function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (!isPngBytes(bytes) || bytes.byteLength < 24) {
    return null;
  }
  const length = readUint32(bytes, 8);
  const type = String.fromCharCode(bytes[12] ?? 0, bytes[13] ?? 0, bytes[14] ?? 0, bytes[15] ?? 0);
  if (type !== "IHDR" || length < 8) {
    return null;
  }
  return { width: readUint32(bytes, 16), height: readUint32(bytes, 20) };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.byteLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.byteLength);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  const crcInput = out.subarray(4, 8 + data.byteLength);
  view.setUint32(8 + data.byteLength, crc32(crcInput));
  return out;
}

async function pipeZlib(data: Uint8Array, format: "deflate"): Promise<Uint8Array> {
  const payload = new Uint8Array(data.byteLength);
  payload.set(data);
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(payload);
      controller.close();
    },
  });
  const stream = source.pipeThrough(new CompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function zlibCompress(data: Uint8Array): Promise<Uint8Array> {
  return pipeZlib(data, "deflate");
}

async function zlibInflate(data: Uint8Array): Promise<Uint8Array> {
  const payload = new Uint8Array(data.byteLength);
  payload.set(data);
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(payload);
      controller.close();
    },
  });
  const stream = source.pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Encode an 8-bit RGBA bitmap as a non-interlaced PNG. */
export async function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Promise<Uint8Array> {
  assertEdge(width, height);
  if (rgba.byteLength !== width * height * 4) {
    throw new FaviconImageNormalizeError("INVALID_IMAGE");
  }
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = new Uint8Array(height * (width * 4 + 1));
  const stride = width * 4;
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), row + 1);
  }
  const compressed = await zlibCompress(raw);
  return concatBytes([
    Uint8Array.from(PNG_SIGNATURE),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const pa = Math.abs(estimate - left);
  const pb = Math.abs(estimate - up);
  const pc = Math.abs(estimate - upLeft);
  if (pa <= pb && pa <= pc) {
    return left;
  }
  if (pb <= pc) {
    return up;
  }
  return upLeft;
}

type PngBitmap = {
  width: number;
  height: number;
  rgba: Uint8Array;
};

function samplesPerPixel(colorType: number): number {
  switch (colorType) {
    case 0:
      return 1;
    case 2:
      return 3;
    case 4:
      return 2;
    case 6:
      return 4;
    default:
      throw new FaviconImageNormalizeError("UNSUPPORTED_PNG");
  }
}

function unfilterScanlines(data: Uint8Array, height: number, stride: number, bpp: number): Uint8Array {
  const expected = height * (stride + 1);
  if (data.byteLength < expected) {
    throw new FaviconImageNormalizeError("UNSUPPORTED_PNG");
  }
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = data[y * (stride + 1)] ?? 0;
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const prev = y > 0 ? dst - stride : -1;
    for (let x = 0; x < stride; x += 1) {
      const raw = data[src + x] ?? 0;
      const left = x >= bpp ? (out[dst + x - bpp] ?? 0) : 0;
      const up = prev >= 0 ? (out[prev + x] ?? 0) : 0;
      const upLeft = prev >= 0 && x >= bpp ? (out[prev + x - bpp] ?? 0) : 0;
      let value = raw;
      if (filter === 1) {
        value = raw + left;
      } else if (filter === 2) {
        value = raw + up;
      } else if (filter === 3) {
        value = raw + Math.floor((left + up) / 2);
      } else if (filter === 4) {
        value = raw + paeth(left, up, upLeft);
      } else if (filter !== 0) {
        throw new FaviconImageNormalizeError("UNSUPPORTED_PNG");
      }
      out[dst + x] = value & 0xff;
    }
  }
  return out;
}

function scanlinesToRgba(
  pixels: Uint8Array,
  width: number,
  height: number,
  colorType: number,
): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  const spp = samplesPerPixel(colorType);
  for (let i = 0; i < width * height; i += 1) {
    const s = i * spp;
    const d = i * 4;
    if (colorType === 6) {
      rgba[d] = pixels[s] ?? 0;
      rgba[d + 1] = pixels[s + 1] ?? 0;
      rgba[d + 2] = pixels[s + 2] ?? 0;
      rgba[d + 3] = pixels[s + 3] ?? 255;
    } else if (colorType === 2) {
      rgba[d] = pixels[s] ?? 0;
      rgba[d + 1] = pixels[s + 1] ?? 0;
      rgba[d + 2] = pixels[s + 2] ?? 0;
      rgba[d + 3] = 255;
    } else if (colorType === 0) {
      const gray = pixels[s] ?? 0;
      rgba[d] = gray;
      rgba[d + 1] = gray;
      rgba[d + 2] = gray;
      rgba[d + 3] = 255;
    } else {
      const gray = pixels[s] ?? 0;
      rgba[d] = gray;
      rgba[d + 1] = gray;
      rgba[d + 2] = gray;
      rgba[d + 3] = pixels[s + 1] ?? 255;
    }
  }
  return rgba;
}

/** Decode a non-interlaced 8-bit PNG (gray, RGB, or RGBA). */
export async function decodePngRgba(bytes: Uint8Array): Promise<PngBitmap> {
  const declared = readPngDimensions(bytes);
  if (!declared) {
    throw new FaviconImageNormalizeError("INVALID_IMAGE");
  }
  assertEdge(declared.width, declared.height);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatParts: Uint8Array[] = [];
  while (offset + 12 <= bytes.byteLength) {
    const length = readUint32(bytes, offset);
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.byteLength) {
      throw new FaviconImageNormalizeError("INVALID_IMAGE");
    }
    const data = bytes.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = readUint32(data, 0);
      height = readUint32(data, 4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
      interlace = data[12] ?? 0;
      if ((data[10] ?? 0) !== 0 || (data[11] ?? 0) !== 0) {
        throw new FaviconImageNormalizeError("UNSUPPORTED_PNG");
      }
    } else if (type === "IDAT") {
      idatParts.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }
  assertEdge(width, height);
  if (bitDepth !== 8 || interlace !== 0 || ![0, 2, 4, 6].includes(colorType)) {
    throw new FaviconImageNormalizeError("UNSUPPORTED_PNG");
  }
  let inflated: Uint8Array;
  try {
    inflated = await zlibInflate(concatBytes(idatParts));
  } catch {
    throw new FaviconImageNormalizeError("UNSUPPORTED_PNG");
  }
  const spp = samplesPerPixel(colorType);
  const stride = width * spp;
  const pixels = unfilterScanlines(inflated, height, stride, spp);
  if (pixels.byteLength !== width * height * spp) {
    throw new FaviconImageNormalizeError("INVALID_IMAGE");
  }
  return { width, height, rgba: scanlinesToRgba(pixels, width, height, colorType) };
}

function sampleBilinear(src: Uint8Array, sw: number, sh: number, x: number, y: number): [number, number, number, number] {
  const x0 = Math.max(0, Math.min(sw - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(sh - 1, Math.floor(y)));
  const x1 = Math.min(sw - 1, x0 + 1);
  const y1 = Math.min(sh - 1, y0 + 1);
  const tx = x <= 0 || x >= sw - 1 ? 0 : x - Math.floor(x);
  const ty = y <= 0 || y >= sh - 1 ? 0 : y - Math.floor(y);
  const at = (px: number, py: number, channel: number) => src[(py * sw + px) * 4 + channel] ?? 0;
  const mix = (channel: number) => {
    const top = at(x0, y0, channel) * (1 - tx) + at(x1, y0, channel) * tx;
    const bottom = at(x0, y1, channel) * (1 - tx) + at(x1, y1, channel) * tx;
    return Math.round(top * (1 - ty) + bottom * ty);
  };
  return [mix(0), mix(1), mix(2), mix(3)];
}

/** Cover-scale an RGBA bitmap into a square, smoothing when the source is smaller. */
export function scaleRgbaCover(src: Uint8Array, sw: number, sh: number, size: number): Uint8Array {
  assertEdge(sw, sh);
  if (!Number.isInteger(size) || size < 1) {
    throw new FaviconImageNormalizeError("INVALID_IMAGE");
  }
  if (src.byteLength !== sw * sh * 4) {
    throw new FaviconImageNormalizeError("INVALID_IMAGE");
  }
  const out = new Uint8Array(size * size * 4);
  const scale = Math.max(size / sw, size / sh);
  const offsetX = (size - sw * scale) / 2;
  const offsetY = (size - sh * scale) / 2;
  for (let y = 0; y < size; y += 1) {
    const sy = (y + 0.5 - offsetY) / scale - 0.5;
    for (let x = 0; x < size; x += 1) {
      const sx = (x + 0.5 - offsetX) / scale - 0.5;
      const [r, g, b, a] = sampleBilinear(src, sw, sh, sx, sy);
      const index = (y * size + x) * 4;
      out[index] = r;
      out[index + 1] = g;
      out[index + 2] = b;
      out[index + 3] = a;
    }
  }
  return out;
}

export async function resizePngBytesToSquare(bytes: Uint8Array, size: number): Promise<Uint8Array> {
  const bitmap = await decodePngRgba(bytes);
  const scaled = scaleRgbaCover(bitmap.rgba, bitmap.width, bitmap.height, size);
  return encodeRgbaPng(size, size, scaled);
}

type IcoEntry = {
  width: number;
  height: number;
  offset: number;
  size: number;
};

function readIcoEntries(bytes: Uint8Array): IcoEntry[] | null {
  if (bytes.byteLength < 6 || bytes[0] !== 0 || bytes[1] !== 0) {
    return null;
  }
  const type = readUint16LE(bytes, 2);
  if (type !== 1 && type !== 2) {
    return null;
  }
  const count = readUint16LE(bytes, 4);
  if (count < 1 || count > 64 || 6 + count * 16 > bytes.byteLength) {
    return null;
  }
  const entries: IcoEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16;
    const width = bytes[entry] === 0 ? 256 : (bytes[entry] ?? 0);
    const height = bytes[entry + 1] === 0 ? 256 : (bytes[entry + 1] ?? 0);
    const size = readUint32LE(bytes, entry + 8);
    const offset = readUint32LE(bytes, entry + 12);
    if (width < 1 || height < 1 || size < 1 || offset + size > bytes.byteLength) {
      continue;
    }
    entries.push({ width, height, offset, size });
  }
  return entries.length > 0 ? entries : null;
}

/** Largest PNG payload embedded in an ICO/CUR, if any. */
export function extractLargestIcoPng(bytes: Uint8Array): Uint8Array | null {
  const entries = readIcoEntries(bytes);
  if (!entries) {
    return null;
  }
  const pngEntries = entries.filter((entry) => isPngBytes(bytes.subarray(entry.offset, entry.offset + entry.size)));
  pngEntries.sort((a, b) => b.width * b.height - a.width * a.height);
  const best = pngEntries[0];
  if (!best) {
    return null;
  }
  assertEdge(best.width, best.height);
  return bytes.slice(best.offset, best.offset + best.size);
}

/**
 * Largest 32-bit BMP image inside an ICO (no PNG payload).
 * Returns null when the file is not an ICO or the bitmap is not 32-bit BI_RGB.
 */
export function decodeLargestIcoBmp(bytes: Uint8Array): PngBitmap | null {
  const entries = readIcoEntries(bytes);
  if (!entries) {
    return null;
  }
  const bmps = entries
    .filter((entry) => !isPngBytes(bytes.subarray(entry.offset, entry.offset + 8)))
    .slice()
    .sort((a, b) => b.width * b.height - a.width * a.height);
  for (const entry of bmps) {
    const dib = bytes.subarray(entry.offset, entry.offset + entry.size);
    if (dib.byteLength < 40 || readUint32LE(dib, 0) !== 40) {
      continue;
    }
    const width = readInt32LE(dib, 4);
    const heightDoubled = readInt32LE(dib, 8);
    const planes = readUint16LE(dib, 12);
    const bitCount = readUint16LE(dib, 14);
    const compression = readUint32LE(dib, 16);
    if (planes !== 1 || bitCount !== 32 || compression !== 0 || width < 1 || heightDoubled < 2) {
      continue;
    }
    if (heightDoubled % 2 !== 0) {
      continue;
    }
    const height = heightDoubled / 2;
    assertEdge(width, height);
    const pixelBytes = width * height * 4;
    if (40 + pixelBytes > dib.byteLength) {
      continue;
    }
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const srcRow = 40 + (height - 1 - y) * width * 4;
      for (let x = 0; x < width; x += 1) {
        const src = srcRow + x * 4;
        const dst = (y * width + x) * 4;
        rgba[dst] = dib[src + 2] ?? 0;
        rgba[dst + 1] = dib[src + 1] ?? 0;
        rgba[dst + 2] = dib[src] ?? 0;
        rgba[dst + 3] = dib[src + 3] ?? 255;
      }
    }
    return { width, height, rgba };
  }
  return null;
}
