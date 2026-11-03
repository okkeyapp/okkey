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
      reject(new Error("INVALID_IMAGE"));
    };
    image.src = objectUrl;
  });
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return loadImageFromBlob(file);
}

function drawCoverToFaviconCanvas(image: CanvasImageSource, sourceWidth: number, sourceHeight: number): HTMLCanvasElement {
  const size = FAVICON_IMAGE_SIZE_PX;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("CANVAS_UNAVAILABLE");
  }

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("INVALID_IMAGE");
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

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    throw new Error("ENCODE_FAILED");
  }
  return blob;
}

/** Resize a JPG/PNG to a square PNG blob (cover crop), matching stored favicon dimensions. */
export async function resizeImageFileToFaviconPng(file: File): Promise<Blob> {
  if (!isAcceptedFaviconImageFile(file)) {
    throw new Error("UNSUPPORTED_FORMAT");
  }

  const image = await loadImageFromFile(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const canvas = drawCoverToFaviconCanvas(image, sourceWidth, sourceHeight);
  return canvasToPngBlob(canvas);
}

export async function resizeImageFileToFaviconPngBytes(file: File): Promise<Uint8Array> {
  const blob = await resizeImageFileToFaviconPng(file);
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Normalize any fetched/manual favicon image bytes to a square PNG at {@link FAVICON_IMAGE_SIZE_PX}
 * (≥ {@link FAVICON_MIN_SIZE_PX}). Used for website preview bytes as well as manual uploads.
 */
export async function normalizeFaviconImageBytesToPng(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.byteLength === 0) {
    throw new Error("INVALID_IMAGE");
  }
  const blob = new Blob([bytes]);
  const image = await loadImageFromBlob(blob);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const canvas = drawCoverToFaviconCanvas(image, sourceWidth, sourceHeight);
  const pngBlob = await canvasToPngBlob(canvas);
  return new Uint8Array(await pngBlob.arrayBuffer());
}
