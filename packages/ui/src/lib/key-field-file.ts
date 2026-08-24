export type KeyFieldFileValue = {
  attachmentId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  url?: string;
};

export function serializeKeyFieldFileValue(value: KeyFieldFileValue | null): string {
  if (!value) {
    return "";
  }

  return JSON.stringify(value);
}

export function parseKeyFieldFileValue(value: string): KeyFieldFileValue | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const record = parsed as Partial<KeyFieldFileValue>;
    if (
      typeof record.attachmentId !== "string" ||
      typeof record.name !== "string" ||
      typeof record.mimeType !== "string" ||
      typeof record.sizeBytes !== "number"
    ) {
      return null;
    }

    if (!record.attachmentId.trim()) {
      return null;
    }

    return {
      attachmentId: record.attachmentId.trim(),
      name: record.name,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      url: typeof record.url === "string" && record.url.trim() ? record.url : undefined,
    };
  } catch {
    return null;
  }
}

export function hasKeyFieldFileAttachment(value: string): boolean {
  return parseKeyFieldFileValue(value) !== null;
}

export function isKeyFieldFileImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

function getFileExtension(name: string): string {
  const baseName = name.trim().split(/[/\\]/).pop() ?? name.trim();
  const dotIndex = baseName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === baseName.length - 1) {
    return "";
  }

  return baseName.slice(dotIndex + 1).toLowerCase();
}

const extensionColorByType: Record<string, string> = {
  pdf: "#DC2626",
  doc: "#2563EB",
  docx: "#2563EB",
  dot: "#2563EB",
  dotx: "#2563EB",
  rtf: "#2563EB",
  odt: "#2563EB",
  xls: "#16A34D",
  xlsx: "#16A34D",
  csv: "#16A34D",
  ods: "#16A34D",
  ppt: "#EA580C",
  pptx: "#EA580C",
  odp: "#EA580C",
  zip: "#78716C",
  rar: "#78716C",
  "7z": "#78716C",
  tar: "#78716C",
  gz: "#78716C",
  mp3: "#9333EA",
  wav: "#9333EA",
  mp4: "#9333EA",
  mov: "#9333EA",
  avi: "#9333EA",
  mkv: "#9333EA",
  txt: "#64748B",
  md: "#64748B",
  json: "#64748B",
  xml: "#64748B",
  html: "#64748B",
  htm: "#64748B",
};

const mimeTypeColorByType: Record<string, string> = {
  "application/pdf": "#DC2626",
  "application/msword": "#2563EB",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "#2563EB",
  "application/vnd.ms-excel": "#16A34D",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "#16A34D",
  "text/csv": "#16A34D",
  "application/vnd.ms-powerpoint": "#EA580C",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "#EA580C",
  "application/zip": "#78716C",
  "application/x-rar-compressed": "#78716C",
  "application/x-7z-compressed": "#78716C",
  "text/plain": "#64748B",
  "video/mp4": "#9333EA",
};

const mimeTypeLabelByType: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "text/csv": "CSV",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
  "application/zip": "ZIP",
  "application/x-rar-compressed": "RAR",
  "application/x-7z-compressed": "7Z",
  "text/plain": "TXT",
  "video/mp4": "MP4",
};

export function getKeyFieldFileExtensionLabel(name: string, mimeType?: string): string {
  const extension = getFileExtension(name);
  if (extension) {
    return extension.toUpperCase().slice(0, 4);
  }

  const normalizedMimeType = mimeType?.trim().toLowerCase() ?? "";
  if (normalizedMimeType && mimeTypeLabelByType[normalizedMimeType]) {
    return mimeTypeLabelByType[normalizedMimeType]!;
  }

  return "FILE";
}

export function getKeyFieldFileExtensionColor(name: string, mimeType?: string): string {
  const extension = getFileExtension(name);
  if (extension && extensionColorByType[extension]) {
    return extensionColorByType[extension]!;
  }

  const normalizedMimeType = mimeType?.trim().toLowerCase() ?? "";
  if (normalizedMimeType && mimeTypeColorByType[normalizedMimeType]) {
    return mimeTypeColorByType[normalizedMimeType]!;
  }

  return "#64748B";
}

export function formatKeyFieldFileSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return "0 B";
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    const kilobytes = sizeBytes / 1024;
    return `${kilobytes < 10 ? kilobytes.toFixed(1) : Math.round(kilobytes)} KB`;
  }

  if (sizeBytes < 1024 * 1024 * 1024) {
    const megabytes = sizeBytes / (1024 * 1024);
    const roundedMegabytes = Math.round(megabytes);
    if (Math.abs(megabytes - roundedMegabytes) < 1e-9) {
      return `${roundedMegabytes} MB`;
    }
    return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`;
  }

  const gigabytes = sizeBytes / (1024 * 1024 * 1024);
  return `${gigabytes.toFixed(1)} GB`;
}

export function formatKeyFieldFileMeta(name: string, mimeType: string, sizeBytes: number): string {
  return `${formatKeyFieldFileSize(sizeBytes)} · ${getKeyFieldFileExtensionLabel(name, mimeType)}`;
}

export type KeyFieldFileUploadConstraints = {
  allowedExtensions: readonly string[];
  maxSizeBytes: number;
};

export const defaultKeyFieldFileUploadConstraints: KeyFieldFileUploadConstraints = {
  allowedExtensions: ["jpg", "png", "pdf", "zip", "rar"],
  maxSizeBytes: 2 * 1024 * 1024,
};

const mimeTypeByExtension: Record<string, string[]> = {
  jpg: ["image/jpeg", "image/jpg"],
  jpeg: ["image/jpeg", "image/jpg"],
  png: ["image/png"],
  pdf: ["application/pdf"],
  mp4: ["video/mp4"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  zip: ["application/zip", "application/x-zip-compressed"],
  rar: ["application/vnd.rar", "application/x-rar-compressed"],
};

const primaryMimeTypeByExtension: Record<string, string> = Object.fromEntries(
  Object.entries(mimeTypeByExtension).flatMap(([extension, mimeTypes]) =>
    mimeTypes[0] ? [[extension, mimeTypes[0]]] : [],
  ),
);

export function resolveKeyFieldFileMimeType(name: string, mimeType?: string): string {
  const normalizedMimeType = mimeType?.trim().toLowerCase() ?? "";
  if (normalizedMimeType && normalizedMimeType !== "application/octet-stream") {
    return normalizedMimeType;
  }

  const extension = getFileExtension(name);
  if (extension && primaryMimeTypeByExtension[extension]) {
    return primaryMimeTypeByExtension[extension]!;
  }

  return normalizedMimeType || "application/octet-stream";
}

export function buildKeyFieldFileUploadConstraints(
  allowedExtensions: readonly string[],
  maxSizeMb: number,
): KeyFieldFileUploadConstraints {
  return {
    allowedExtensions: allowedExtensions.map((extension) => extension.toLowerCase()),
    maxSizeBytes: maxSizeMb * 1024 * 1024,
  };
}

export type KeyFieldFileUploadHintLabels = {
  /** Shown before size when allowed extensions are listed, e.g. `max: `. */
  maxPrefix: string;
  /** Shown before size when no extensions are configured, e.g. `Maximum size: `. */
  maxSizeOnlyPrefix: string;
};

export const defaultKeyFieldFileUploadHintLabels: KeyFieldFileUploadHintLabels = {
  maxPrefix: "max: ",
  maxSizeOnlyPrefix: "Maximum size: ",
};

export function formatKeyFieldFileUploadHint(
  constraints: KeyFieldFileUploadConstraints,
  labels: KeyFieldFileUploadHintLabels = defaultKeyFieldFileUploadHintLabels,
): string {
  const maxPart = `${labels.maxPrefix}${formatKeyFieldFileSize(constraints.maxSizeBytes)}`;
  if (constraints.allowedExtensions.length === 0) {
    return `${labels.maxSizeOnlyPrefix}${formatKeyFieldFileSize(constraints.maxSizeBytes)}`;
  }
  const types = constraints.allowedExtensions.map((extension) => extension.toLowerCase()).join(", ");
  return `${types} · ${maxPart}`;
}

function normalizeUploadExtension(file: File): string {
  const extension = getFileExtension(file.name);
  if (extension === "jpeg") {
    return "jpg";
  }

  return extension;
}

function isAllowedKeyFieldFileExtension(extension: string, constraints: KeyFieldFileUploadConstraints): boolean {
  const normalizedExtension = extension === "jpeg" ? "jpg" : extension;
  const allowed = new Set(constraints.allowedExtensions.map((item) => item.toLowerCase()));

  if (allowed.has(normalizedExtension)) {
    return true;
  }

  if (allowed.has("jpg") && normalizedExtension === "jpeg") {
    return true;
  }

  return false;
}

export function validateKeyFieldFileUpload(
  file: File,
  constraints: KeyFieldFileUploadConstraints,
): boolean {
  const extension = normalizeUploadExtension(file);
  if (constraints.allowedExtensions.length > 0) {
    if (extension) {
      if (!isAllowedKeyFieldFileExtension(extension, constraints)) {
        return false;
      }
    } else {
      const mimeType = file.type.trim().toLowerCase();
      const allowedMimeTypes = constraints.allowedExtensions.flatMap(
        (allowedExtension) => mimeTypeByExtension[allowedExtension.toLowerCase()] ?? [],
      );
      if (!mimeType || !allowedMimeTypes.includes(mimeType)) {
        return false;
      }
    }
  }

  return file.size > 0 && file.size <= constraints.maxSizeBytes;
}
