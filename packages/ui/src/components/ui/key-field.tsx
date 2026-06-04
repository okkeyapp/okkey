import * as React from "react";

import { cn } from "../../lib/utils.js";
import { Button } from "./button.js";

export type KeyFormMode = "view" | "edit";

export type KeyFieldTypeOption = {
  id: string;
  label: string;
  description?: string;
};

export const keyFieldTypeOptions: readonly KeyFieldTypeOption[] = [
  { id: "text", label: "Текст" },
  { id: "password", label: "Пароль" },
  { id: "username", label: "Имя пользователя" },
  { id: "email", label: "Email" },
  { id: "url", label: "Website URL" },
  { id: "totp", label: "Одноразовый пароль (TOTP)" },
  { id: "note", label: "Заметка" },
  { id: "phone", label: "Телефон" },
  { id: "card-number", label: "Номер карты" },
  { id: "card-expiry", label: "Срок действия карты" },
  { id: "date", label: "Дата" },
  { id: "file", label: "Файл" },
  { id: "ssh-key", label: "SSH ключ" },
  { id: "api-key", label: "API ключ" },
  { id: "recovery-code", label: "Код восстановления" },
  { id: "custom", label: "Произвольное поле" },
];

function PencilIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
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
  labelClassName?: string;
  valueClassName?: string;
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
      labelClassName,
      valueClassName,
      dragHandleProps,
      draggable,
      onDragStart,
      onDragEnd,
      ...props
    },
    ref,
  ) => {
    const [isEditingLabel, setIsEditingLabel] = React.useState(false);
    const [draftLabel, setDraftLabel] = React.useState(label);
    const stringValue = typeof value === "string" ? value : undefined;
    const [draftValue, setDraftValue] = React.useState(stringValue ?? "");
    const canEditLabel = mode === "edit" && editableLabel;
    const canEditValue = mode === "edit" && editableValue && children === undefined && stringValue !== undefined;
    const canReorder = mode === "edit" && reorderable;

    React.useEffect(() => {
      setDraftLabel(label);
    }, [label]);

    React.useEffect(() => {
      setDraftValue(stringValue ?? "");
    }, [stringValue]);

    function commitLabel() {
      const nextLabel = draftLabel.trim();
      setIsEditingLabel(false);
      if (nextLabel && nextLabel !== label) {
        onLabelChange?.(nextLabel);
      } else {
        setDraftLabel(label);
      }
    }

    return (
      <div
        ref={ref}
        className={cn(
          "group/key-field -mt-px flex min-w-0 items-center gap-2.5 border-y border-border px-4 py-2",
          className,
        )}
        draggable={canReorder ? draggable : false}
        onDragStart={canReorder ? onDragStart : undefined}
        onDragEnd={canReorder ? onDragEnd : undefined}
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
            {...dragHandleProps}
          >
            <GripIcon className="size-4" />
          </span>
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
                className="size-5 min-h-5 min-w-5 rounded-sm text-muted-foreground hover:text-foreground"
                onClick={() => setIsEditingLabel(true)}
                aria-label="Редактировать лейбл поля"
              >
                <PencilIcon className="size-3.5" />
              </Button>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className={cn("min-w-0 text-sm leading-5 text-foreground", valueClassName)}>
              {canEditValue ? (
                <input
                  value={draftValue}
                  onChange={(event) => {
                    setDraftValue(event.target.value);
                    onValueChange?.(event.target.value);
                  }}
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
