import * as React from "react";

import {
  defaultKeyFieldFileUploadConstraints,
  formatKeyFieldFileMeta,
  formatKeyFieldFileUploadHint,
  getKeyFieldFileExtensionColor,
  getKeyFieldFileExtensionLabel,
  isKeyFieldFileImageMimeType,
  parseKeyFieldFileValue,
  serializeKeyFieldFileValue,
  validateKeyFieldFileUpload,
  type KeyFieldFileUploadConstraints,
  type KeyFieldFileValue,
} from "../../lib/key-field-file.js";
import { cn } from "../../lib/utils.js";
import { KeyFieldFileLightbox } from "./key-field-file-lightbox.js";

function UploadFileIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path
        d="M22 12H16L14 15H10L8 12H2M2 12L5.45 5.11C5.61558 4.77679 5.87083 4.49637 6.18704 4.30028C6.50326 4.10419 6.86792 4.0002 7.24 4H16.76C17.1321 4.0002 17.4967 4.10419 17.813 4.30028C18.1292 4.49637 18.3844 4.77679 18.55 5.11L22 12V18C22 18.5304 21.7893 19.0391 21.4142 19.4142C21.0391 19.7893 20.5304 20 20 20H4C3.46957 20 2.96086 19.7893 2.58579 19.4142C2.21071 19.0391 2 18.5304 2 18V12Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileExtensionBadge({ file }: { file: KeyFieldFileValue }) {
  const label = getKeyFieldFileExtensionLabel(file.name, file.mimeType);
  const backgroundColor = getKeyFieldFileExtensionColor(file.name, file.mimeType);

  return (
    <span
      className="flex size-full items-center justify-center px-1 text-center text-[11px] font-semibold uppercase leading-none text-white"
      style={{ backgroundColor }}
    >
      {label}
    </span>
  );
}

function UploadProgressBar({ progress }: { progress: number }) {
  const safeProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className="flex w-full max-w-xs flex-col gap-2 px-4">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-150 ease-out"
          style={{ width: `${safeProgress}%` }}
        />
      </div>
      <span className="text-center text-xs font-medium text-muted-foreground">{safeProgress}%</span>
    </div>
  );
}

export type KeyFieldFileUploadHandler = (
  file: File,
  onProgress: (percent: number) => void,
) => Promise<KeyFieldFileValue>;

export type KeyFieldFileControlProps = {
  value: string;
  mode: "edit" | "view";
  onValueChange?: (value: string) => void;
  onUploadFile?: KeyFieldFileUploadHandler;
  uploadConstraints?: KeyFieldFileUploadConstraints;
  onValidationErrorChange?: (hasError: boolean) => void;
  onOpen?: () => void;
  className?: string;
  uploadLabel?: string;
};

function FileThumbnail({
  file,
  onClick,
}: {
  file: KeyFieldFileValue;
  onClick?: () => void;
}) {
  const isImage = isKeyFieldFileImageMimeType(file.mimeType);
  const clickable = Boolean(onClick);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={cn(
        "flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted",
        clickable && "cursor-pointer transition-opacity hover:opacity-90",
        !clickable && "cursor-default",
      )}
      aria-label={clickable ? file.name : undefined}
    >
      {isImage ? (
        <img src={file.url} alt={file.name} className="size-full object-cover" />
      ) : (
        <FileExtensionBadge file={file} />
      )}
    </button>
  );
}

export function KeyFieldFileControl({
  value,
  mode,
  onValueChange,
  onUploadFile,
  uploadConstraints = defaultKeyFieldFileUploadConstraints,
  onValidationErrorChange,
  onOpen,
  className,
  uploadLabel = "Upload file",
}: KeyFieldFileControlProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [hasValidationError, setHasValidationError] = React.useState(false);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const parsedFile = parseKeyFieldFileValue(value);
  const uploadHint = formatKeyFieldFileUploadHint(uploadConstraints);

  React.useEffect(() => {
    if (parsedFile) {
      setHasValidationError(false);
      onValidationErrorChange?.(false);
    }
  }, [parsedFile, onValidationErrorChange]);

  function setValidationError(hasError: boolean) {
    setHasValidationError(hasError);
    onValidationErrorChange?.(hasError);
  }

  async function handleSelectedFile(selectedFile: File | null) {
    if (!selectedFile || !onUploadFile || !onValueChange || mode !== "edit") {
      return;
    }

    if (!validateKeyFieldFileUpload(selectedFile, uploadConstraints)) {
      setValidationError(true);
      return;
    }

    setValidationError(false);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const uploaded = await onUploadFile(selectedFile, setUploadProgress);
      setUploadProgress(100);
      onValueChange(serializeKeyFieldFileValue(uploaded));
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    void handleSelectedFile(selectedFile);
    event.target.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (mode !== "edit" || parsedFile) {
      return;
    }

    void handleSelectedFile(event.dataTransfer.files[0] ?? null);
  }

  function handlePreviewClick() {
    if (!parsedFile) {
      return;
    }

    if (onOpen) {
      onOpen();
      return;
    }

    if (isKeyFieldFileImageMimeType(parsedFile.mimeType)) {
      setLightboxOpen(true);
      return;
    }

    window.open(parsedFile.url, "_blank", "noopener,noreferrer");
  }

  if (parsedFile) {
    return (
      <>
        <div className={cn("flex min-h-20 items-center gap-3", className)}>
          <FileThumbnail file={parsedFile} onClick={handlePreviewClick} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{parsedFile.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatKeyFieldFileMeta(parsedFile.name, parsedFile.mimeType, parsedFile.sizeBytes)}
            </p>
          </div>
        </div>
        {lightboxOpen && !onOpen && isKeyFieldFileImageMimeType(parsedFile.mimeType) ? (
          <KeyFieldFileLightbox file={parsedFile} onClose={() => setLightboxOpen(false)} />
        ) : null}
      </>
    );
  }

  if (mode === "view") {
    return null;
  }

  return (
    <div className={cn("w-full", className)}>
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleInputChange} />
      <button
        type="button"
        disabled={isUploading}
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsDragging(false);
          }
        }}
        onDrop={handleDrop}
        className={cn(
          "flex h-20 w-full flex-col items-center justify-center gap-1 rounded-sm border-2 border-dashed border-input bg-transparent px-4 text-foreground transition-colors",
          "hover:border-accent hover:bg-muted/40",
          isDragging && "border-accent bg-muted/40",
          isUploading && "pointer-events-none",
        )}
      >
        {isUploading ? (
          <UploadProgressBar progress={uploadProgress} />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <UploadFileIcon className="size-6 shrink-0" />
              <span className="text-sm font-medium">{uploadLabel}</span>
            </div>
            <p className={cn("text-xs", hasValidationError ? "text-destructive" : "text-muted-foreground")}>{uploadHint}</p>
          </>
        )}
      </button>
    </div>
  );
}

export type KeyFieldFileInputProps = Omit<KeyFieldFileControlProps, "mode">;

export function KeyFieldFileInput(props: KeyFieldFileInputProps) {
  return <KeyFieldFileControl {...props} mode="edit" />;
}

export type KeyFieldFileViewProps = Omit<KeyFieldFileControlProps, "mode" | "onValueChange" | "onUploadFile" | "onValidationErrorChange">;

export function KeyFieldFileView(props: KeyFieldFileViewProps) {
  return <KeyFieldFileControl {...props} mode="view" />;
}
