import { cn, inputLikeControlClassName } from "@okkey/ui";
import { normalizeAllowedFileExtensions, normalizeFileExtensionTag } from "@okkey/types";
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type SVGProps } from "react";

type FileExtensionTagsInputProps = {
  value: readonly string[];
  disabled?: boolean;
  placeholder?: string;
  removeTagAriaLabel: (tag: string) => string;
  inputAriaLabel: string;
  onCommit: (extensions: string[]) => void;
};

function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function splitDraftTokens(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((part) => normalizeFileExtensionTag(part))
    .filter(Boolean);
}

function mergeExtensionTokens(current: readonly string[], raw: string): string[] {
  const next = [...current];
  for (const token of splitDraftTokens(raw)) {
    if (!next.includes(token)) {
      next.push(token);
    }
  }
  return next;
}

function extensionListsEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => item === right[index]);
}

export default function FileExtensionTagsInput({
  value,
  disabled = false,
  placeholder,
  removeTagAriaLabel,
  inputAriaLabel,
  onCommit,
}: FileExtensionTagsInputProps) {
  const inputId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [localExtensions, setLocalExtensions] = useState<string[]>(() => [...value]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setLocalExtensions((prev) => (extensionListsEqual(prev, value) ? prev : [...value]));
  }, [value]);

  const commitToParent = (extensions: readonly string[]) => {
    onCommit(normalizeAllowedFileExtensions(extensions));
  };

  const handleContainerBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (containerRef.current?.contains(nextTarget)) {
      return;
    }

    const nextExtensions = draft.trim() ? mergeExtensionTokens(localExtensions, draft) : localExtensions;
    setLocalExtensions(nextExtensions);
    setDraft("");
    commitToParent(nextExtensions);
  };

  const handleTokenSeparatorKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!draft.trim()) {
      if (event.key === "Backspace" && localExtensions.length > 0) {
        event.preventDefault();
        setLocalExtensions((prev) => prev.slice(0, -1));
      }
      return;
    }

    if (event.key === " " || event.key === "," || event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const next = mergeExtensionTokens(localExtensions, draft);
      setLocalExtensions(next);
      setDraft("");
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  };

  const removeTag = (tag: string) => {
    setLocalExtensions((prev) => prev.filter((item) => item !== tag));
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        inputLikeControlClassName,
        "!h-auto min-h-9 py-[3px]",
        localExtensions.length === 0 ? "px-3" : "px-[3px]",
        "flex w-full cursor-text items-center text-left normal-case",
        "focus-within:border-accent focus-within:bg-background focus-within:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
        "focus-within:hover:border-accent focus-within:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
        "dark:focus-within:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)] dark:focus-within:hover:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
        disabled && "cursor-not-allowed opacity-50",
      )}
      onBlur={handleContainerBlur}
      onClick={() => {
        if (!disabled) {
          inputRef.current?.focus();
        }
      }}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-wrap content-center items-center gap-1 overflow-x-hidden overflow-y-visible">
        {localExtensions.map((tag) => (
          <span
            key={tag}
            className="box-border inline-flex min-h-[28px] min-w-0 max-w-full items-center gap-0.5 rounded-[6px] bg-secondary py-0.5 pl-2 pr-1 text-xs font-medium leading-normal text-secondary-foreground normal-case"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <span className="min-w-0 max-w-full break-words leading-snug">{tag}</span>
            {!disabled ? (
              <button
                type="button"
                aria-label={removeTagAriaLabel(tag)}
                className={cn(
                  "inline-flex size-[22px] shrink-0 items-center justify-center rounded-[6px] text-secondary-foreground outline-none",
                  "hover:bg-secondary-foreground/15 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                )}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  removeTag(tag);
                  inputRef.current?.focus();
                }}
              >
                <XIcon className="size-3.5" />
              </button>
            ) : null}
          </span>
        ))}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          disabled={disabled}
          value={draft}
          placeholder={localExtensions.length === 0 ? placeholder : undefined}
          aria-label={inputAriaLabel}
          className="min-w-[4rem] flex-1 border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleTokenSeparatorKey}
        />
      </div>
    </div>
  );
}
