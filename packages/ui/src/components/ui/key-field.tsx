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

function CopyIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M4.66602 6.44499C4.66602 5.97344 4.85334 5.5212 5.18678 5.18776C5.52022 4.85432 5.97246 4.66699 6.44402 4.66699H12.2213C12.4548 4.66699 12.686 4.71298 12.9018 4.80233C13.1175 4.89169 13.3135 5.02265 13.4786 5.18776C13.6437 5.35286 13.7747 5.54886 13.864 5.76458C13.9534 5.9803 13.9993 6.2115 13.9993 6.44499V12.2223C13.9993 12.4558 13.9534 12.687 13.864 12.9027C13.7747 13.1185 13.6437 13.3145 13.4786 13.4796C13.3135 13.6447 13.1175 13.7756 12.9018 13.865C12.686 13.9543 12.4548 14.0003 12.2213 14.0003H6.44402C6.21053 14.0003 5.97932 13.9543 5.7636 13.865C5.54789 13.7756 5.35188 13.6447 5.18678 13.4796C5.02168 13.3145 4.89071 13.1185 4.80136 12.9027C4.71201 12.687 4.66602 12.4558 4.66602 12.2223V6.44499Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.67467 11.158C2.47023 11.0415 2.30018 10.873 2.18172 10.6697C2.06325 10.4663 2.00057 10.2353 2 10V3.33333C2 2.6 2.6 2 3.33333 2H10C10.5 2 10.772 2.25667 11 2.66667" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopySuccessIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M4.66602 6.44499C4.66602 5.97344 4.85334 5.5212 5.18678 5.18776C5.52022 4.85432 5.97246 4.66699 6.44402 4.66699H12.2213C12.4548 4.66699 12.686 4.71298 12.9018 4.80233C13.1175 4.89169 13.3135 5.02265 13.4786 5.18776C13.6437 5.35286 13.7747 5.54886 13.864 5.76458C13.9534 5.9803 13.9993 6.2115 13.9993 6.44499V12.2223C13.9993 12.4558 13.9534 12.687 13.864 12.9027C13.7747 13.1185 13.6437 13.3145 13.4786 13.4796C13.3135 13.6447 13.1175 13.7756 12.9018 13.865C12.686 13.9543 12.4548 14.0003 12.2213 14.0003H6.44402C6.21053 14.0003 5.97932 13.9543 5.7636 13.865C5.54789 13.7756 5.35188 13.6447 5.18678 13.4796C5.02168 13.3145 4.89071 13.1185 4.80136 12.9027C4.71201 12.687 4.66602 12.4558 4.66602 12.2223V6.44499Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.67467 11.158C2.47 11.0417 2.29977 10.8733 2.18127 10.6699C2.06277 10.4665 2.00023 10.2354 2 10V3.33333C2 2.6 2.6 2 3.33333 2H10C10.5 2 10.772 2.25667 11 2.66667" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.33398 9.33333L8.66732 10.6667L11.334 8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
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
  multilineValue?: boolean;
  autoFocusValue?: boolean;
  reorderable?: boolean;
  onLabelChange?: (label: string) => void;
  onValueChange?: (value: string) => void;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  copyValue?: string;
  copyLabel?: string;
  copySuccessLabel?: string | null;
  copyIcon?: React.ReactNode;
  copySuccessIcon?: React.ReactNode;
  copyIconPosition?: "start" | "end";
  copyHoverClassName?: string;
  copyHoverActiveClassName?: string;
  copyOverlayClassName?: string;
  copyTextClassName?: string;
  floatingActions?: React.ReactNode;
  isHoverLocked?: boolean;
  forceActive?: boolean;
  isInvalid?: boolean;
  fieldOverlay?: React.ReactNode;
  concealValue?: boolean;
  concealedValue?: string;
  onCopyAction?: (value: string) => void | Promise<void>;
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
      multilineValue = false,
      autoFocusValue = false,
      reorderable = false,
      onLabelChange,
      onValueChange,
      meta,
      actions,
      copyValue,
      copyLabel = "Copy",
      copySuccessLabel = "Coped",
      copyIcon,
      copySuccessIcon,
      copyIconPosition = "start",
      copyHoverClassName,
      copyHoverActiveClassName,
      copyOverlayClassName,
      copyTextClassName,
      floatingActions,
      isHoverLocked = false,
      forceActive = false,
      isInvalid = false,
      fieldOverlay,
      concealValue = false,
      concealedValue = "••••••••••",
      onCopyAction,
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
    const valueInputRef = React.useRef<HTMLInputElement | null>(null);
    const valueTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const [draftLabel, setDraftLabel] = React.useState(label);
    const stringValue = typeof value === "string" ? value : undefined;
    const [draftValue, setDraftValue] = React.useState(stringValue ?? "");
    const canEditLabel = mode === "edit" && editableLabel;
    const canEditValue = mode === "edit" && editableValue && children === undefined && stringValue !== undefined;
    const canReorder = mode === "edit" && reorderable;
    const isFieldActive = isEditingLabel || isValueFocused || forceActive || isInvalid;
    const shouldConcealValue = concealValue && !isValueFocused && draftValue.length > 0;
    const displayedValue = shouldConcealValue ? concealedValue : children ?? value;
    const copyText = copyValue ?? stringValue;
    const canCopyValue = mode === "view" && typeof copyText === "string" && copyText.length > 0;
    const [isCopied, setIsCopied] = React.useState(false);
    const copyResetTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentCopyIcon = isCopied
      ? copySuccessIcon ?? <CopySuccessIcon className="size-4" />
      : copyIcon ?? <CopyIcon className="size-4" />;

    const resizeTextarea = React.useCallback(() => {
      const valueControl = valueTextareaRef.current;
      if (!valueControl) {
        return;
      }

      valueControl.style.height = "auto";
      valueControl.style.height = `${valueControl.scrollHeight}px`;
    }, []);

    const setValueTextareaRef = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        valueTextareaRef.current = node;
        if (node) {
          resizeTextarea();
          window.requestAnimationFrame(resizeTextarea);
        }
      },
      [resizeTextarea],
    );

    const focusValueControl = React.useCallback(() => {
      if (multilineValue) {
        valueTextareaRef.current?.focus();
        return;
      }

      valueInputRef.current?.focus();
    }, [multilineValue]);

    React.useEffect(() => {
      setDraftLabel(label);
    }, [label]);

    React.useEffect(() => {
      setDraftValue(stringValue ?? "");
    }, [stringValue]);

    React.useLayoutEffect(() => {
      if (multilineValue) {
        resizeTextarea();
      }
    }, [draftValue, multilineValue, resizeTextarea]);

    React.useEffect(() => {
      if (autoFocusValue && canEditValue) {
        const frameId = window.requestAnimationFrame(() => {
          window.requestAnimationFrame(focusValueControl);
        });
        const timeoutId = window.setTimeout(focusValueControl, 50);

        return () => {
          window.cancelAnimationFrame(frameId);
          window.clearTimeout(timeoutId);
        };
      }

      return undefined;
    }, [autoFocusValue, canEditValue, focusValueControl]);

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

      if (onCopyAction) {
        await onCopyAction(copyText);
      } else {
        await navigator.clipboard.writeText(copyText);
      }
      if (copySuccessLabel !== null) {
        setIsCopied(true);
      }
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
        focusValueControl();
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
          fieldOverlay && "relative",
          (canCopyValue || floatingActions) && "relative transition-colors",
          canCopyValue && copyHoverClassName,
          isHoverLocked && copyHoverActiveClassName,
          className,
          isFieldActive &&
            (isInvalid
              ? "relative z-10 border-x-destructive border-y-destructive shadow-[0_0_0_2px_hsl(var(--destructive)_/_0.4)]"
              : "relative z-10 border-x-accent border-y-accent shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]"),
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
              isHoverLocked && "pointer-events-auto opacity-100",
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
              {copyIconPosition === "start" ? currentCopyIcon : null}
              {isCopied ? copySuccessLabel : copyLabel}
              {copyIconPosition === "end" ? currentCopyIcon : null}
            </span>
          </button>
        ) : null}

        {floatingActions ? (
          <div
            className={cn(
              "pointer-events-none absolute right-4 top-1/2 z-20 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity",
              "group-hover/key-field:pointer-events-auto group-hover/key-field:opacity-100",
              isHoverLocked && "pointer-events-auto opacity-100",
            )}
          >
            {floatingActions}
          </div>
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
            <div className={cn("min-h-5 min-w-0 flex-1 text-sm leading-5 text-foreground", valueClassName)}>
              {canEditValue ? (
                multilineValue ? (
                  <textarea
                    ref={setValueTextareaRef}
                    value={draftValue}
                    rows={2}
                    onChange={(event) => {
                      setDraftValue(event.target.value);
                      onValueChange?.(event.target.value);
                    }}
                    onFocus={() => {
                      setIsValueFocused(true);
                      resizeTextarea();
                    }}
                    onBlur={() => setIsValueFocused(false)}
                    className="min-h-10 w-full min-w-0 resize-none overflow-hidden bg-transparent p-0 text-sm leading-5 text-foreground outline-none"
                  />
                ) : (
                  <input
                    ref={valueInputRef}
                    value={shouldConcealValue ? concealedValue : draftValue}
                    onChange={(event) => {
                      setDraftValue(event.target.value);
                      onValueChange?.(event.target.value);
                    }}
                    onFocus={() => setIsValueFocused(true)}
                    onBlur={() => setIsValueFocused(false)}
                    className="h-5 w-full min-w-0 bg-transparent p-0 text-sm leading-5 text-foreground outline-none"
                  />
                )
              ) : (
                displayedValue
              )}
            </div>
            {meta ? <div className="shrink-0">{meta}</div> : null}
          </div>
        </div>

        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
        {fieldOverlay}
      </div>
    );
  },
);
KeyField.displayName = "KeyField";
