import type { WebMessageValues } from "@okkey/i18n";
import { cn, mutedSurfaceHoverBgClassName } from "@okkey/ui";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

type NewItemTagsSectionProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  tags: readonly string[];
  onTagsChange: (tags: string[]) => void;
};

const tagPillClassName = cn(
  "inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2 text-sm text-foreground",
  "dark:bg-muted",
);

function TagPlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path
        d="M8 3.33337V12.6667M3.33337 8H12.6667"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TagCloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path d="M5 5L11 11M11 5L5 11" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

const tagDraftMeasureClassName = "pointer-events-none invisible absolute left-0 top-0 whitespace-pre text-sm";
const tagDraftMinSample = "000";
const tagDraftWidthBufferPx = 4;
const tagDraftMaxWidthPx = 192;

function normalizeTagValue(raw: string): string {
  return raw.trim();
}

export default function NewItemTagsSection({ t, tags, onTagsChange }: NewItemTagsSectionProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const minInputWidthPxRef = useRef<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [inputWidthPx, setInputWidthPx] = useState(0);

  useEffect(() => {
    if (isAdding) {
      inputRef.current?.focus();
    } else {
      minInputWidthPxRef.current = null;
    }
  }, [isAdding]);

  useLayoutEffect(() => {
    const measureEl = measureRef.current;
    if (!isAdding || !measureEl) {
      return;
    }

    if (minInputWidthPxRef.current === null) {
      measureEl.textContent = tagDraftMinSample;
      minInputWidthPxRef.current = Math.ceil(measureEl.getBoundingClientRect().width);
    }

    const minWidthPx = minInputWidthPxRef.current;
    measureEl.textContent = draft.length > 0 ? draft : tagDraftMinSample;
    const measuredWidthPx = Math.ceil(measureEl.getBoundingClientRect().width);
    setInputWidthPx(Math.min(tagDraftMaxWidthPx, Math.max(minWidthPx, measuredWidthPx) + tagDraftWidthBufferPx));
  }, [draft, isAdding]);

  const removeTag = (tag: string) => {
    onTagsChange(tags.filter((value) => value !== tag));
  };

  const commitDraft = (raw: string, options?: { refocus?: boolean }): boolean => {
    const value = normalizeTagValue(raw);
    if (!value) {
      return false;
    }
    if (!tags.includes(value)) {
      onTagsChange([...tags, value]);
    }
    setDraft("");
    if (options?.refocus !== false) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
    return true;
  };

  const handleAddPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  const handleAddClick = () => {
    if (isAdding) {
      if (normalizeTagValue(draft)) {
        commitDraft(draft);
        return;
      }
      inputRef.current?.focus();
      return;
    }
    setIsAdding(true);
    setDraft("");
  };

  const handleDraftBlur = () => {
    const value = normalizeTagValue(draft);
    if (!value) {
      setIsAdding(false);
      setDraft("");
      return;
    }
    commitDraft(draft, { refocus: false });
    setIsAdding(false);
  };

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commitDraft(draft);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setIsAdding(false);
      setDraft("");
    }
  };

  return (
    <div className="flex items-center gap-3 py-4">
      <label htmlFor={isAdding ? `${listId}-draft` : undefined} className="shrink-0 text-sm font-medium text-foreground">
        {t("web.newItemPopup.tagsLabel")}
      </label>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" role="list" aria-labelledby={listId}>
        <span id={listId} className="sr-only">
          {t("web.newItemPopup.tagsLabel")}
        </span>
        {tags.map((tag) => (
          <span key={tag} role="listitem" className={tagPillClassName}>
            <span className="max-w-[12rem] truncate">{tag}</span>
            <button
              type="button"
              className="flex size-4 shrink-0 items-center justify-center rounded-full text-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={t("web.newItemPopup.removeTagAria", { tag })}
              onClick={() => removeTag(tag)}
            >
              <TagCloseIcon />
            </button>
          </span>
        ))}
        {isAdding ? (
          <span className={cn(tagPillClassName, "relative px-2")}>
            <span ref={measureRef} aria-hidden className={tagDraftMeasureClassName} />
            <input
              ref={inputRef}
              id={`${listId}-draft`}
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={handleDraftBlur}
              onKeyDown={handleDraftKeyDown}
              aria-label={t("web.newItemPopup.tagInputAria")}
              style={{ width: inputWidthPx > 0 ? `${inputWidthPx}px` : undefined }}
              className="max-w-[12rem] border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </span>
        ) : null}
        <button
          type="button"
          aria-label={t("web.newItemPopup.addTagAria")}
          className={cn(
            "inline-flex size-[26px] shrink-0 items-center justify-center rounded-full bg-slate-100 text-foreground dark:bg-muted",
            mutedSurfaceHoverBgClassName,
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
          onPointerDown={handleAddPointerDown}
          onClick={handleAddClick}
        >
          <TagPlusIcon />
        </button>
      </div>
    </div>
  );
}
