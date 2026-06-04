import * as React from "react";

import { cn } from "../../lib/utils.js";
import { Button } from "./button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu.js";
import { keyFieldTypeOptions, type KeyFieldTypeOption, type KeyFormMode } from "./key-field.js";
import { ScrollArea } from "./scroll-area.js";

function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

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
            "overflow-hidden rounded-xl",
            variant === "primary" && "border border-border bg-card text-card-foreground",
            variant === "additional" && "bg-secondary text-secondary-foreground",
          )}
        >
          {shouldShowHeader ? (
            <div className="flex min-w-0 items-center gap-1.5 border-b border-border px-4 py-3">
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
                    "min-w-0 flex-1 truncate text-sm font-semibold leading-5 text-foreground",
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
                  className="size-5 min-h-5 min-w-5 rounded-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setIsEditingTitle(true)}
                  aria-label="Редактировать название секции"
                >
                  <PencilIcon className="size-3.5" />
                </Button>
              ) : null}
              {headerActions}
            </div>
          ) : null}

          <div className={cn(!canAddField && "[&>*:last-child]:border-b-0")}>{children}</div>

          {canAddField && singleAddFieldType ? (
            <Button
              type="button"
              variant="secondary"
              className={cn(
                "-mt-px h-8 w-full rounded-none border-t border-border bg-secondary px-3 font-medium text-foreground shadow-none",
                "hover:bg-[color-mix(in_hsl,hsl(var(--secondary))_94%,hsl(var(--foreground))_6%)]",
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
                    "-mt-px h-8 w-full rounded-none border-t border-border bg-secondary px-3 font-medium text-foreground shadow-none",
                    "hover:bg-[color-mix(in_hsl,hsl(var(--secondary))_94%,hsl(var(--foreground))_6%)]",
                  )}
                >
                  <PlusIcon className="size-4" />
                  {addFieldLabel}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="min-w-[240px] p-1">
                <ScrollArea className="max-h-[320px]">
                  {fieldTypes.map((type) => (
                    <DropdownMenuItem key={type.id} onSelect={() => onAddField?.(type)}>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{type.label}</span>
                        {type.description ? <span className="truncate text-xs text-muted-foreground">{type.description}</span> : null}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </section>
    );
  },
);
KeySection.displayName = "KeySection";
