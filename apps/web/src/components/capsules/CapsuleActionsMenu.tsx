import type { WebMessageValues } from "@okkey/i18n";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "@okkey/ui";
import { useState } from "react";

import { IconActions16 } from "../items/itemCategoryIcons";
import {
  CapsuleActivateIcon,
  CapsuleCopyIcon,
  CapsuleDeactivateIcon,
  CapsuleDeleteIcon,
  CapsuleMoreIcon,
} from "./capsuleIcons";

type CapsuleActionsMenuProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  variant: "icon" | "button";
  align?: "start" | "end";
  canCopy?: boolean;
  canActivate: boolean;
  canDeactivate: boolean;
  onCopy?: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
};

export default function CapsuleActionsMenu({
  t,
  variant,
  align = "end",
  canCopy = true,
  canActivate,
  canDeactivate,
  onCopy,
  onActivate,
  onDeactivate,
  onDelete,
}: CapsuleActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const actionsLabel = t("web.items.list.actions");

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <Button
            type="button"
            size="iconSm"
            variant="ghost"
            aria-label={actionsLabel}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <CapsuleMoreIcon />
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="default"
            className={cn(
              "shrink-0 gap-2",
              align === "start" &&
                "max-md:!size-9 max-md:!min-h-9 max-md:!min-w-9 max-md:gap-0 max-md:rounded-md max-md:px-0",
            )}
            aria-label={actionsLabel}
          >
            <span className={align === "start" ? "hidden md:inline" : undefined}>{actionsLabel}</span>
            <IconActions16 className="shrink-0 text-foreground" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-auto min-w-56 p-1">
        <DropdownMenuGroup>
          {canCopy && onCopy ? (
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => {
                setOpen(false);
                onCopy();
              }}
            >
              <CapsuleCopyIcon className="size-4 shrink-0" />
              <span>Копировать ссылку</span>
            </DropdownMenuItem>
          ) : null}
          {canDeactivate ? (
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => {
                setOpen(false);
                onDeactivate();
              }}
            >
              <CapsuleDeactivateIcon className="size-4 shrink-0" />
              <span>Деактивировать</span>
            </DropdownMenuItem>
          ) : null}
          {canActivate ? (
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => {
                setOpen(false);
                onActivate();
              }}
            >
              <CapsuleActivateIcon className="size-4 shrink-0" />
              <span>Активировать</span>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            className="gap-2 text-destructive data-[highlighted]:bg-destructive/15 data-[highlighted]:text-destructive"
            onSelect={() => {
              setOpen(false);
              onDelete();
            }}
          >
            <CapsuleDeleteIcon className="size-4 shrink-0" />
            <span>Удалить</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
