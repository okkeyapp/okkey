import { FaviconImageNormalizeError } from "./faviconImageError";
import {
  decodeLargestIcoBmp,
  encodeRgbaPng,
  extractLargestIcoPng,
  FAVICON_MAX_SOURCE_EDGE_PX,
  isPngBytes,
  resizePngBytesToSquare,
  scaleRgbaCover,
} from "./faviconPng";
import { looksLikeSvgBytes, sanitizeSvgMarkup } from "./faviconSvg";

export { FAVICON_MAX_SOURCE_EDGE_PX } from "./faviconPng";
export { FaviconImageNormalizeError, isFaviconImageNormalizeError } from "./faviconImageError";

export const FAVICON_IMAGE_SIZE_PX = 80;

/** Product minimum: stored icons must be at least 60×60 CSS px (we normalize to 80). */
export const FAVICON_MIN_SIZE_PX = 60;

const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/jpg"]);

export function isAcceptedFaviconImageFile(file: File): boolean {
  const mime = file.type.trim().toLowerCase();
  if (ACCEPTED_MIME_TYPES.has(mime)) {
    return true;
  }
  const name = file.name.trim().toLowerCase();
  return name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png");
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new FaviconImageNormalizeError("INVALID_IMAGE"));
    };
    image.src = objectUrl;
  });
}

function browserCanvasAvailable(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  // jsdom logs and throws from getContext unless the optional canvas package is installed.
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
    return false;
  }
  try {
    return Boolean(document.createElement("canvas").getContext("2d"));
  } catch {
    return false;
  }
}

function drawCoverToFaviconCanvas(image: CanvasImageSource, sourceWidth: number, sourceHeight: number): HTMLCanvasElement {
  const size = FAVICON_IMAGE_SIZE_PX;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new FaviconImageNormalizeError("CANVAS_UNAVAILABLE");
  }

  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth < 1 ||
    sourceHeight < 1 ||
    sourceWidth > FAVICON_MAX_SOURCE_EDGE_PX ||
    sourceHeight > FAVICON_MAX_SOURCE_EDGE_PX
  ) {
    throw new FaviconImageNormalizeError("IMAGE_DIMENSIONS");
  }

  // Smooth upscaling for small source icons (16/32) so the 80px tile stays sharp at DPR 2.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const scale = Math.max(size / sourceWidth, size / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const offsetX = (size - drawWidth) / 2;
  const offsetY = (size - drawHeight) / 2;

  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  return canvas;
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    throw new FaviconImageNormalizeError("ENCODE_FAILED");
  }
  return new Uint8Array(await blob.arrayBuffer());
}

async function normalizeViaCanvas(bytes: Uint8Array, mimeType: string): Promise<Uint8Array> {
  if (!browserCanvasAvailable()) {
    throw new FaviconImageNormalizeError("CANVAS_UNAVAILABLE");
  }
  const blob = new Blob([bytes], { type: mimeType });
  const image = await loadImageFromBlob(blob);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const canvas = drawCoverToFaviconCanvas(image, sourceWidth, sourceHeight);
  return canvasToPngBytes(canvas);
}

/**
 * Rasterize a sanitized SVG through an image element.
 * Scripts do not run: the markup is XML-parsed, active tags are removed, and the
 * result is loaded as an image (not inserted as HTML).
 */
async function rasterizeSvgBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const markup = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const sanitized = sanitizeSvgMarkup(markup);
  return normalizeViaCanvas(new TextEncoder().encode(sanitized), "image/svg+xml");
}

async function normalizeRasterBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const pngPayload = isPngBytes(bytes) ? bytes : extractLargestIcoPng(bytes);
  if (pngPayload) {
    try {
      return await resizePngBytesToSquare(pngPayload, FAVICON_IMAGE_SIZE_PX);
    } catch (error) {
      if (error instanceof FaviconImageNormalizeError && error.code === "UNSUPPORTED_PNG") {
        return normalizeViaCanvas(pngPayload, "image/png");
      }
      throw error;
    }
  }

  const bmp = decodeLargestIcoBmp(bytes);
  if (bmp) {
    const scaled = scaleRgbaCover(bmp.rgba, bmp.width, bmp.height, FAVICON_IMAGE_SIZE_PX);
    return encodeRgbaPng(FAVICON_IMAGE_SIZE_PX, FAVICON_IMAGE_SIZE_PX, scaled);
  }

  return normalizeViaCanvas(bytes, "application/octet-stream");
}

/**
 * Normalize fetched or manual favicon bytes to a square PNG at {@link FAVICON_IMAGE_SIZE_PX}
 * (≥ {@link FAVICON_MIN_SIZE_PX}). Small icons are upscaled with smoothing; large ones are
 * downscaled. Failures throw — callers must not store the original bytes.
 */
export async function normalizeFaviconImageBytesToPng(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.byteLength === 0) {
    throw new FaviconImageNormalizeError("INVALID_IMAGE");
  }
  if (looksLikeSvgBytes(bytes)) {
    return rasterizeSvgBytes(bytes);
  }
  return normalizeRasterBytes(bytes);
}

/** Resize a JPG/PNG to a square PNG blob (cover crop), matching stored favicon dimensions. */
export async function resizeImageFileToFaviconPng(file: File): Promise<Blob> {
  if (!isAcceptedFaviconImageFile(file)) {
    throw new FaviconImageNormalizeError("UNSUPPORTED_FORMAT");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const png = await normalizeFaviconImageBytesToPng(bytes);
  return new Blob([png], { type: "image/png" });
}

export async function resizeImageFileToFaviconPngBytes(file: File): Promise<Uint8Array> {
  const blob = await resizeImageFileToFaviconPng(file);
  return new Uint8Array(await blob.arrayBuffer());
}
