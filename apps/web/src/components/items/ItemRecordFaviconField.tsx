import { useRef, type ReactNode, type SVGProps } from "react";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, cn } from "@okkey/ui";

/** Chevron for favicon upload trigger. */
function FolderDropdownChevronIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden {...props}>
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UploadIconGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path
        d="M2.66663 11.3335V12.6668C2.66663 13.0205 2.8071 13.3596 3.05715 13.6096C3.3072 13.8597 3.64634 14.0002 3.99996 14.0002H12C12.3536 14.0002 12.6927 13.8597 12.9428 13.6096C13.1928 13.3596 13.3333 13.0205 13.3333 12.6668V11.3335"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.66663 5.99984L7.99996 2.6665L11.3333 5.99984"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 2.6665V10.6665" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type ItemRecordFaviconUploadControlProps = {
  uploadLabel: string;
  invalidFileMessage?: string;
  uploadError?: string | null;
  onUploadFile: (file: File) => void | Promise<void>;
};

export function ItemRecordFaviconUploadControl({
  uploadLabel,
  invalidFileMessage,
  uploadError,
  onUploadFile,
}: ItemRecordFaviconUploadControlProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleSelectedFile(file: File | null) {
    if (!file) {
      return;
    }
    await onUploadFile(file);
  }

  return (
    <div className="absolute bottom-[-2px] right-[-2px] z-[2] flex size-[18px] items-center justify-center">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(event) => {
          void handleSelectedFile(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "pointer-events-auto !size-[18px] !min-h-0 !max-h-[18px] !min-w-[18px] shrink-0 !gap-0 !p-0 !leading-none rounded-[6px]",
              "[&_svg]:!size-3",
            )}
            aria-label={uploadLabel}
          >
            <FolderDropdownChevronIcon className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="bottom" className="z-[100] min-w-[200px] p-1" collisionPadding={16}>
          <DropdownMenuItem className="gap-2" onSelect={() => fileInputRef.current?.click()}>
            <UploadIconGlyph className="size-4 shrink-0 text-foreground" />
            {uploadLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {uploadError && invalidFileMessage ? (
        <p className="absolute left-0 top-full mt-1 w-max max-w-[12rem] text-xs text-destructive">{invalidFileMessage}</p>
      ) : null}
    </div>
  );
}

type ItemRecordFaviconFieldProps = {
  children: ReactNode;
  showUploadControl?: boolean;
  uploadLabel: string;
  invalidFileMessage?: string;
  uploadError?: string | null;
  onUploadFile?: (file: File) => void | Promise<void>;
};

export function ItemRecordFaviconField({
  children,
  showUploadControl = false,
  uploadLabel,
  invalidFileMessage,
  uploadError,
  onUploadFile,
}: ItemRecordFaviconFieldProps) {
  return (
    <div className="relative size-10 shrink-0">
      {children}
      {showUploadControl && onUploadFile ? (
        <ItemRecordFaviconUploadControl
          uploadLabel={uploadLabel}
          invalidFileMessage={invalidFileMessage}
          uploadError={uploadError}
          onUploadFile={onUploadFile}
        />
      ) : null}
    </div>
  );
}
