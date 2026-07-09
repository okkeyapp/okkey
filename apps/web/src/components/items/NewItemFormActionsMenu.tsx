import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "@okkey/ui";
import { useState } from "react";

import { IconActions16, IconDelete16, IconSaveTemplate16 } from "./itemCategoryIcons";

type NewItemFormActionsMenuProps = {
  t: (messageKey: string) => string;
  disabled?: boolean;
  showDeleteTemplate?: boolean;
  onSaveTemplate: () => void;
  onDeleteTemplate?: () => void;
};

export default function NewItemFormActionsMenu({
  t,
  disabled = false,
  showDeleteTemplate = false,
  onSaveTemplate,
  onDeleteTemplate,
}: NewItemFormActionsMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          className={cn(
            "shrink-0 gap-2",
            "max-md:!size-9 max-md:!min-h-9 max-md:!min-w-9 max-md:gap-0 max-md:rounded-md max-md:px-0",
          )}
          disabled={disabled}
          aria-label={t("web.items.list.actions")}
        >
          <IconActions16 className="size-4 shrink-0 text-foreground" />
          <span className="hidden md:inline">{t("web.items.list.actions")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 p-1">
        <DropdownMenuItem
          className="gap-2"
          onSelect={() => {
            setOpen(false);
            onSaveTemplate();
          }}
        >
          <IconSaveTemplate16 className="size-4 shrink-0 text-foreground" />
          <span>{t("web.newItemPopup.saveTemplate")}</span>
        </DropdownMenuItem>
        {showDeleteTemplate && onDeleteTemplate ? (
          <>
            <DropdownMenuSeparator className="mx-1 my-1" />
            <DropdownMenuItem
              className="gap-2 text-destructive data-[highlighted]:bg-destructive/15 data-[highlighted]:text-destructive"
              onSelect={() => {
                setOpen(false);
                onDeleteTemplate();
              }}
            >
              <IconDelete16 className="size-4 shrink-0" />
              <span>{t("web.newItemPopup.deleteTemplate")}</span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
