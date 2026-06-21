import * as React from "react";

import { cn } from "../../lib/utils.js";
import { Button } from "./button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu.js";
import { keyFieldTypeOptions, type KeyFieldTypeOption, type KeyFormMode } from "./key-field.js";

function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M3.33337 7.99992H12.6667M8.00004 3.33325V12.6666" stroke="#0A0A0A" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

export type KeySectionVariant = "primary" | "additional";

export type KeySectionProps = Omit<React.ComponentPropsWithoutRef<"section">, "title"> & {
  title?: string;
  variant?: KeySectionVariant;
  mode?: KeyFormMode;
  editableTitle?: boolean;
  reorderable?: boolean;
  onTitleChange?: (title: string) => void;
  addFieldLabel?: string;
  fieldTypes?: readonly KeyFieldTypeOption[];
  onAddField?: (type: KeyFieldTypeOption) => void;
  headerActions?: React.ReactNode;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
};

export const KeySection = React.forwardRef<HTMLElement, KeySectionProps>(
  (
    {
      className,
      title,
      variant = "primary",
      mode = "view",
      editableTitle = false,
      reorderable = false,
      onTitleChange,
      addFieldLabel = "Добавить поле",
      fieldTypes = keyFieldTypeOptions,
      onAddField,
      headerActions,
      dragHandleProps,
      children,
      draggable,
      onDragStart,
      onDragEnd,
      ...props
    },
    ref,
  ) => {
    const [isEditingTitle, setIsEditingTitle] = React.useState(false);
    const [draftTitle, setDraftTitle] = React.useState(title ?? "");
    const isEditMode = mode === "edit";
    const canEditTitle = isEditMode && variant === "additional" && editableTitle;
    const canReorder = isEditMode && variant === "additional" && reorderable;
    const canAddField = isEditMode && Boolean(onAddField);
    const singleAddFieldType = fieldTypes.length === 1 ? fieldTypes[0] : undefined;
    const shouldShowHeader = Boolean(title) || canEditTitle || Boolean(headerActions);

    React.useEffect(() => {
      setDraftTitle(title ?? "");
    }, [title]);

    function commitTitle() {
      const nextTitle = draftTitle.trim();
      setIsEditingTitle(false);
      if (nextTitle !== (title ?? "")) {
        onTitleChange?.(nextTitle);
      } else {
        setDraftTitle(title ?? "");
      }
    }

    return (
      <section
        ref={ref}
        className={cn("relative transition-all duration-200 ease-out", className)}
        draggable={canReorder ? draggable : false}
        onDragStart={canReorder ? onDragStart : undefined}
        onDragEnd={canReorder ? onDragEnd : undefined}
        {...props}
      >
        <div
          className={cn(
            "rounded-xl",
            variant === "primary" && "bg-card text-card-foreground",
            variant === "additional" && "bg-secondary text-secondary-foreground",
          )}
        >
          {shouldShowHeader ? (
            <div
              className={cn(
                "flex min-w-0 items-center gap-1.5 rounded-t-xl border border-x-transparent border-b-border border-t-transparent px-4 py-3",
                isEditingTitle && "relative z-10 border-x-accent border-y-accent shadow-[0_0_0_2px_hsl(var(--accent)_/_0.4)]",
              )}
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
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {isEditingTitle ? (
                  <input
                    value={draftTitle}
                    placeholder="Указать заголовок"
                    onChange={(event) => setDraftTitle(event.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitTitle();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setDraftTitle(title ?? "");
                        setIsEditingTitle(false);
                      }
                    }}
                    autoFocus
                    className="h-5 min-w-0 flex-1 bg-transparent p-0 text-sm font-semibold leading-5 text-foreground outline-none"
                  />
                ) : (
                  <h3
                    className={cn(
                      "min-w-0 truncate text-sm font-semibold leading-5 text-foreground",
                      !title && "text-muted-foreground",
                    )}
                  >
                    {title || "Указать заголовок"}
                  </h3>
                )}
                {canEditTitle && !isEditingTitle ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="iconSm"
                    className={cn(
                      "size-5 min-h-5 min-w-5 rounded-sm text-muted-foreground hover:text-foreground",
                      variant === "additional" && "hover:!bg-card",
                    )}
                    onClick={() => setIsEditingTitle(true)}
                    aria-label="Редактировать название секции"
                  >
                    <PencilIcon className="size-3.5" />
                  </Button>
                ) : null}
              </div>
              {headerActions}
            </div>
          ) : null}

          <div
            className={cn(
              shouldShowHeader && "[&>*:first-child]:-mt-px",
              "[&>*+*]:-mt-px",
              !shouldShowHeader && "[&>*:first-child]:rounded-t-xl",
              !canAddField && "[&>*:last-child]:rounded-b-xl",
            )}
          >
            {children}
          </div>

          {canAddField && singleAddFieldType ? (
            <Button
              type="button"
              variant="secondary"
              className={cn(
                "-mt-px h-8 w-full rounded-b-xl rounded-t-none border border-border bg-secondary px-3 font-medium text-foreground shadow-none",
                variant === "additional" && "border-x-transparent border-b-transparent",
                "hover:bg-[color-mix(in_hsl,hsl(var(--secondary))_94%,hsl(var(--foreground))_6%)]",
                "focus:border-accent focus-visible:border-accent",
              )}
              onClick={() => onAddField?.(singleAddFieldType)}
            >
              <PlusIcon className="size-4" />
              {addFieldLabel}
            </Button>
          ) : canAddField ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  className={cn(
                    "-mt-px h-8 w-full rounded-b-xl rounded-t-none border border-border bg-secondary px-3 font-medium text-foreground shadow-none",
                    variant === "additional" && "border-x-transparent border-b-transparent",
                    "hover:bg-[color-mix(in_hsl,hsl(var(--secondary))_94%,hsl(var(--foreground))_6%)]",
                    "focus:border-accent focus-visible:border-accent",
                  )}
                >
                  <PlusIcon className="size-4" />
                  {addFieldLabel}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="min-w-[240px] p-1">
                {fieldTypes.map((type, index) => (
                  <React.Fragment key={type.id}>
                    {index > 0 && fieldTypes[index - 1]?.group !== type.group ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem onSelect={() => onAddField?.(type)}>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{type.label}</span>
                        {type.description ? <span className="truncate text-xs text-muted-foreground">{type.description}</span> : null}
                      </span>
                    </DropdownMenuItem>
                  </React.Fragment>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </section>
    );
  },
);
KeySection.displayName = "KeySection";
