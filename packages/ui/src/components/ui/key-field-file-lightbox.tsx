import * as React from "react";
import { createPortal } from "react-dom";

import type { KeyFieldFileValue } from "../../lib/key-field-file.js";
import { Button } from "./button.js";

export type KeyFieldFileLightboxProps = {
  file: KeyFieldFileValue & { url: string };
  onClose: () => void;
};

function CloseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function DownloadIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

export function KeyFieldFileLightbox({ file, onClose }: KeyFieldFileLightboxProps) {
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  function handleDownload() {
    window.open(file.url, "_blank", "noopener,noreferrer");
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label={file.name}>
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10 hover:text-white"
          onClick={handleDownload}
          aria-label="Скачать"
        >
          <DownloadIcon className="size-5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10 hover:text-white"
          onClick={onClose}
          aria-label="Закрыть"
        >
          <CloseIcon className="size-5" />
        </Button>
      </div>
      <img src={file.url} alt={file.name} className="max-h-full max-w-full object-contain" />
    </div>,
    document.body,
  );
}
