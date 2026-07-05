export const FAVICON_IMAGE_SIZE_PX = 80;

const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/jpg"]);

export function isAcceptedFaviconImageFile(file: File): boolean {
  const mime = file.type.trim().toLowerCase();
  if (ACCEPTED_MIME_TYPES.has(mime)) {
    return true;
  }
  const name = file.name.trim().toLowerCase();
  return name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png");
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
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

/** Resize a JPG/PNG to a square PNG blob (cover crop), matching stored favicon dimensions. */
export async function resizeImageFileToFaviconPng(file: File): Promise<Blob> {
  if (!isAcceptedFaviconImageFile(file)) {
    throw new Error("UNSUPPORTED_FORMAT");
  }

  const image = await loadImageFromFile(file);
  const size = FAVICON_IMAGE_SIZE_PX;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("CANVAS_UNAVAILABLE");
  }

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("INVALID_IMAGE");
  }

  const scale = Math.max(size / sourceWidth, size / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const offsetX = (size - drawWidth) / 2;
  const offsetY = (size - drawHeight) / 2;

  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    throw new Error("ENCODE_FAILED");
  }

  return blob;
}

export async function resizeImageFileToFaviconPngBytes(file: File): Promise<Uint8Array> {
  const blob = await resizeImageFileToFaviconPng(file);
  return new Uint8Array(await blob.arrayBuffer());
}
