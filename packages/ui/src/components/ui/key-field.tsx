import * as React from "react";

import { cn } from "../../lib/utils.js";
import { Button } from "./button.js";

export type KeyFormMode = "view" | "edit";

export type KeyFieldTypeOption = {
  id: string;
  label: string;
  description?: string;
  group?: "general" | "secret" | "file";
};

export const keyFieldTypeOptions: readonly KeyFieldTypeOption[] = [
  { id: "text", label: "Text", group: "general" },
  { id: "email", label: "Email", group: "general" },
  { id: "phone", label: "Phone", group: "general" },
  { id: "address", label: "Address", group: "general" },
  { id: "date", label: "Date", group: "general" },
  { id: "url", label: "Website URL", group: "general" },
  { id: "multiline-text", label: "Multiline text", group: "general" },
  { id: "password", label: "Password", group: "secret" },
  { id: "totp", label: "Totp", group: "secret" },
  { id: "recovery-codes", label: "Recovery codes", group: "secret" },
  { id: "file", label: "Attach a file", group: "file" },
];

function PencilIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M2.33337 11.6667H4.66671L10.7917 5.54168C10.9449 5.38847 11.0664 5.20659 11.1494 5.00641C11.2323 4.80623 11.275 4.59168 11.275 4.37501C11.275 4.15834 11.2323 3.9438 11.1494 3.74362C11.0664 3.54344 10.9449 3.36156 10.7917 3.20835C10.6385 3.05514 10.4566 2.93361 10.2564 2.85069C10.0563 2.76777 9.84171 2.7251 9.62504 2.7251C9.40837 2.7251 9.19382 2.76777 8.99365 2.85069C8.79347 2.93361 8.61158 3.05514 8.45837 3.20835L2.33337 9.33335V11.6667Z" stroke="#737373" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.875 3.79175L10.2083 6.12508" stroke="#737373" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GripIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <circle cx="9" cy="5" r="1.4" />
      <circle cx="15" cy="5" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="19" r="1.4" />
      <circle cx="15" cy="19" r="1.4" />
    </svg>
  );
}

function CopySuccessIcon(props: React.SVGProps<SVGSVGElement>) {
  const clipPathId = React.useId();

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <g clipPath={`url(#${clipPathId})`}>
        <path d="M6.00016 8.00016L7.3335 9.3335L10.0002 6.66683M14.6668 8.00016C14.6668 11.6821 11.6821 14.6668 8.00016 14.6668C4.31826 14.6668 1.3335 11.6821 1.3335 8.00016C1.3335 4.31826 4.31826 1.3335 8.00016 1.3335C11.6821 1.3335 14.6668 4.31826 14.6668 8.00016Z" stroke="#16A34A" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <defs>
        <clipPath id={clipPathId}>
          <rect width="16" height="16" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

export type KeyFieldProps = Omit<React.ComponentPropsWithoutRef<"div">, "children"> & {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
  mode?: KeyFormMode;
  editableLabel?: boolean;
  editableValue?: boolean;
  reorderable?: boolean;
  onLabelChange?: (label: string) => void;
  onValueChange?: (value: string) => void;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  copyValue?: string;
  copyHoverClassName?: string;
  copyOverlayClassName?: string;
  copyTextClassName?: string;
  labelClassName?: string;
  valueClassName?: string;
  controlButtonClassName?: string;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
};

export const KeyField = React.forwardRef<HTMLDivElement, KeyFieldProps>(
  (
    {
      className,
      label,
      value,
      children,
      mode = "view",
      editableLabel = false,
      editableValue = false,
      reorderable = false,
      onLabelChange,
      onValueChange,
      meta,
      actions,
      copyValue,
      copyHoverClassName,
      copyOverlayClassName,
      copyTextClassName,
      labelClassName,
      valueClassName,
      controlButtonClassName,
      dragHandleProps,
      draggable,
      onDragStart,
      onDragEnd,
      onClick,
      ...props
    },
    ref,
  ) => {
    const [isEditingLabel, setIsEditingLabel] = React.useState(false);
    const [isValueFocused, setIsValueFocused] = React.useState(false);
    const valueInputRef = React.useRef<HTMLInputElement>(null);
    const [draftLabel, setDraftLabel] = React.useState(label);
    const stringValue = typeof value === "string" ? value : undefined;
    const [draftValue, setDraftValue] = React.useState(stringValue ?? "");
    const canEditLabel = mode === "edit" && editableLabel;
    const canEditValue = mode === "edit" && editableValue && children === undefined && stringValue !== undefined;
    const canReorder = mode === "edit" && reorderable;
    const isFieldActive = isEditingLabel || isValueFocused;
    const copyText = copyValue ?? stringValue;
    const canCopyValue = mode === "view" && typeof copyText === "string" && copyText.length > 0;
    const [isCopied, setIsCopied] = React.useState(false);
    const copyResetTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => {
      setDraftLabel(label);
    }, [label]);

    React.useEffect(() => {
      setDraftValue(stringValue ?? "");
    }, [stringValue]);

    React.useEffect(
      () => () => {
        if (copyResetTimeoutRef.current) {
          clearTimeout(copyResetTimeoutRef.current);
        }
      },
      [],
    );

    function commitLabel() {
      const nextLabel = draftLabel.trim();
      setIsEditingLabel(false);
      if (nextLabel && nextLabel !== label) {
        onLabelChange?.(nextLabel);
      } else {
        setDraftLabel(label);
      }
    }

    async function handleCopyClick(event: React.MouseEvent<HTMLButtonElement>) {
      event.preventDefault();
      event.stopPropagation();
      if (!canCopyValue) {
        return;
      }

      await navigator.clipboard.writeText(copyText);
      setIsCopied(true);
      if (copyResetTimeoutRef.current) {
        clearTimeout(copyResetTimeoutRef.current);
      }
      copyResetTimeoutRef.current = setTimeout(() => {
        setIsCopied(false);
        copyResetTimeoutRef.current = null;
      }, 3000);
    }

    function handleFieldClick(event: React.MouseEvent<HTMLDivElement>) {
      onClick?.(event);
      if (event.defaultPrevented) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          "button,input,textarea,select,a,[role='button'],[data-key-field-drag-handle]",
        )
      ) {
        return;
      }

      if (canEditValue) {
        valueInputRef.current?.focus();
        return;
      }

      if (canEditLabel) {
        setIsEditingLabel(true);
      }
    }

    return (
      <div
        ref={ref}
        className={cn(
          "group/key-field -mt-px flex min-w-0 items-center gap-2.5 border-x border-y border-x-transparent border-y-border px-4 py-2",
          isFieldActive && "relative z-10 border-x-accent border-y-accent shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
          canCopyValue && "relative transition-colors",
          canCopyValue && copyHoverClassName,
          className,
        )}
        draggable={canReorder ? draggable : false}
        onDragStart={canReorder ? onDragStart : undefined}
        onDragEnd={canReorder ? onDragEnd : undefined}
        onClick={handleFieldClick}
        {...props}
      >
        {canReorder ? (
          <span
            className={cn(
              "-ml-2 flex size-4 shrink-0 touch-none items-center justify-center text-muted-foreground/70",
              "cursor-grab active:cursor-grabbing",
              dragHandleProps?.className,
            )}
            aria-hidden
            data-key-field-drag-handle
            {...dragHandleProps}
          >
            <GripIcon className="size-4" />
          </span>
        ) : null}

        {canCopyValue ? (
          <button
            type="button"
            className={cn(
              "pointer-events-none absolute inset-0 z-10 flex rounded-[inherit] items-center justify-center opacity-0 transition-opacity",
              "group-hover/key-field:pointer-events-auto group-hover/key-field:opacity-100",
              "focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
              copyOverlayClassName ?? "bg-card/20",
            )}
            onClick={handleCopyClick}
          >
            <span
              className={cn(
                "inline-flex h-6 items-center justify-center gap-1.5 rounded-[50px] px-3 text-sm font-medium text-foreground",
                copyTextClassName ?? "bg-card",
              )}
            >
              {isCopied ? <CopySuccessIcon className="size-4" /> : null}
              {isCopied ? "Coped" : "Copy"}
            </span>
          </button>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {isEditingLabel ? (
              <input
                value={draftLabel}
                onChange={(event) => setDraftLabel(event.target.value)}
                onBlur={commitLabel}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitLabel();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setDraftLabel(label);
                    setIsEditingLabel(false);
                  }
                }}
                autoFocus
                className={cn(
                  "h-5 min-w-0 flex-1 bg-transparent p-0 text-xs text-foreground outline-none",
                  "focus-visible:ring-0",
                  labelClassName,
                )}
              />
            ) : (
              <span className={cn("min-w-0 truncate text-xs leading-5 text-muted-foreground", canEditLabel && "text-foreground", labelClassName)}>
                {label}
              </span>
            )}
            {canEditLabel && !isEditingLabel ? (
              <Button
                type="button"
                variant="ghost"
                size="iconSm"
                className={cn("size-5 min-h-5 min-w-5 rounded-sm text-muted-foreground hover:text-foreground", controlButtonClassName)}
                onClick={() => setIsEditingLabel(true)}
                aria-label="Редактировать лейбл поля"
              >
                <PencilIcon className="size-3.5" />
              </Button>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className={cn("min-h-5 min-w-0 text-sm leading-5 text-foreground", valueClassName)}>
              {canEditValue ? (
                <input
                  ref={valueInputRef}
                  value={draftValue}
                  onChange={(event) => {
                    setDraftValue(event.target.value);
                    onValueChange?.(event.target.value);
                  }}
                  onFocus={() => setIsValueFocused(true)}
                  onBlur={() => setIsValueFocused(false)}
                  className="h-5 min-w-0 bg-transparent p-0 text-sm leading-5 text-foreground outline-none"
                />
              ) : (
                children ?? value
              )}
            </div>
            {meta ? <div className="shrink-0">{meta}</div> : null}
          </div>
        </div>

        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
    );
  },
);
KeyField.displayName = "KeyField";
