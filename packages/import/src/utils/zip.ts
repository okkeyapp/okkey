/** Minimal ZIP reader for import bundles (store + deflate via DecompressionStream). */

export async function unzipToMap(data: Uint8Array): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  while (offset + 4 <= data.length) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) {
      break;
    }
    const flags = view.getUint16(offset + 6, true);
    const compression = view.getUint16(offset + 8, true);
    let compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(data.subarray(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;

    // Bit 3: sizes live in a data descriptor after the payload.
    if ((flags & 0x8) !== 0 && compressedSize === 0) {
      compressedSize = findCompressedSizeViaDataDescriptor(data, dataStart, view);
    }

    const compressed = data.subarray(dataStart, dataStart + compressedSize);

    if (!name.endsWith("/")) {
      let contents: Uint8Array;
      if (compression === 0) {
        contents = compressed.slice();
      } else if (compression === 8) {
        contents = await inflateRaw(compressed, uncompressedSize);
      } else {
        throw new Error(`Unsupported ZIP compression method ${compression} for ${name}`);
      }
      files.set(name.replace(/\\/g, "/"), contents);
    }

    offset = dataStart + compressedSize;
    if ((flags & 0x8) !== 0) {
      // Skip optional data descriptor (signature + crc + sizes = 16, or without signature = 12).
      if (offset + 4 <= data.length && view.getUint32(offset, true) === 0x08074b50) {
        offset += 16;
      } else {
        offset += 12;
      }
    }
  }

  return files;
}

function findCompressedSizeViaDataDescriptor(
  data: Uint8Array,
  dataStart: number,
  view: DataView,
): number {
  for (let i = dataStart; i + 16 <= data.length; i += 1) {
    if (view.getUint32(i, true) === 0x08074b50) {
      return i - dataStart;
    }
    // Descriptor without signature: next local/central header.
    if (view.getUint32(i, true) === 0x04034b50 || view.getUint32(i, true) === 0x02014b50) {
      return Math.max(0, i - dataStart - 12);
    }
  }
  throw new Error("ZIP data descriptor not found");
}

async function inflateRaw(input: Uint8Array, expectedSize: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("ZIP deflate entries require DecompressionStream (modern browser or Node 20+)");
  }
  if (expectedSize > 0 && input.length === expectedSize) {
    // Stored-looking payload mislabeled as deflate.
    return input.slice();
  }

  const stream = new Blob([input]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const inflated = new Uint8Array(await new Response(stream).arrayBuffer());
  if (expectedSize > 0 && inflated.byteLength !== expectedSize) {
    throw new Error(
      `ZIP inflate size mismatch: expected ${expectedSize}, got ${inflated.byteLength}`,
    );
  }
  return inflated;
}

export function createZipFromFiles(files: Record<string, Uint8Array | string>): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
    const nameBytes = new TextEncoder().encode(name);
    const local = new Uint8Array(30 + nameBytes.length + bytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 0, true);
    lv.setUint32(18, bytes.length, true);
    lv.setUint32(22, bytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(bytes, 30 + nameBytes.length);
    chunks.push(local);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(20, bytes.length, true);
    cv.setUint32(24, bytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    central.push(centralHeader);

    offset += local.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = new Uint8Array(offset + centralSize + end.length);
  let writeOffset = 0;
  for (const chunk of chunks) {
    total.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }
  for (const chunk of central) {
    total.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }
  total.set(end, writeOffset);
  return total;
}
