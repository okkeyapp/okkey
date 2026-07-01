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
import {
  keyFieldTypeOptions,
  type KeyFieldTypeOption,
  type KeyFormMode,
} from "./key-field.js";

function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <path d="M3.33337 7.99992H12.6667M8.00004 3.33325V12.6666" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type KeyFormProps = React.ComponentPropsWithoutRef<"div"> & {
  mode?: KeyFormMode;
  addSectionLabel?: string;
  fieldTypes?: readonly KeyFieldTypeOption[];
  onAddSection?: (type: KeyFieldTypeOption) => void;
};

export const KeyForm = React.forwardRef<HTMLDivElement, KeyFormProps>(
  (
    {
      className,
      mode = "view",
      addSectionLabel = "Добавить секцию с полем",
      fieldTypes = keyFieldTypeOptions,
      onAddSection,
      children,
      ...props
    },
    ref,
  ) => {
    const canAddSection = mode === "edit" && Boolean(onAddSection);
    const pendingAddSectionTypeRef = React.useRef<KeyFieldTypeOption | null>(null);

    function queueAddSection(type: KeyFieldTypeOption) {
      pendingAddSectionTypeRef.current = type;
    }

    function flushQueuedAddSection() {
      const type = pendingAddSectionTypeRef.current;
      pendingAddSectionTypeRef.current = null;
      if (type) {
        onAddSection?.(type);
      }
    }

    return (
      <div ref={ref} className={cn("flex min-w-0 flex-col gap-4", className)} {...props}>
        {children}

        {canAddSection ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                className="h-9 w-full rounded-lg bg-secondary px-4 font-medium text-foreground shadow-none"
              >
                <PlusIcon className="size-4" />
                {addSectionLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="center"
              className="min-w-[260px] p-1"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                flushQueuedAddSection();
              }}
            >
              {fieldTypes.map((type, index) => (
                <React.Fragment key={type.id}>
                  {index > 0 && fieldTypes[index - 1]?.group !== type.group ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem onSelect={() => queueAddSection(type)}>
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
    );
  },
);
KeyForm.displayName = "KeyForm";

export { KeySection, type KeySectionProps, type KeySectionVariant } from "./key-section.js";
export {
  KeyField,
  KeyFieldCopyIcon,
  keyFieldTypeOptions,
  type KeyFieldProps,
  type KeyFieldTypeOption,
  type KeyFieldValueTransformContext,
  type KeyFormMode,
} from "./key-field.js";
