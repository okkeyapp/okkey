import type { ItemPlaintextV2 } from "@okkey/types";
import {
  Button,
  ControlGroup,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  KeyField,
  KeyForm,
  KeyFieldCopyIcon,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  buttonVariants,
  cn,
  controlGroupItemFixedClassName,
} from "@okkey/ui";
import { extractReadableItemFields } from "@okkey/vault";
import type { SVGProps } from "react";

function IconCapsule16({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)} {...props}>
      <path
        d="M6.33333 2.66667C7.23949 1.76051 8.4685 1.25144 9.75 1.25144C11.0315 1.25144 12.2605 1.76051 13.1667 2.66667C14.0728 3.57282 14.5819 4.80184 14.5819 6.08333C14.5819 7.36483 14.0728 8.59384 13.1667 9.5L9.75 12.9167C8.84384 13.8228 7.61483 14.3319 6.33333 14.3319C5.05183 14.3319 3.82282 13.8228 2.91667 12.9167C2.01051 12.0105 1.50144 10.7815 1.50144 9.5C1.50144 8.2185 2.01051 6.98949 2.91667 6.08333L6.33333 2.66667Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="4.85355" y1="4.14645" x2="11.8536" y2="11.1464" stroke="currentColor" />
    </svg>
  );
}

function IconFavorite16({ className, filled = false, ...props }: SVGProps<SVGSVGElement> & { filled?: boolean }) {
  if (filled) {
    return (
      <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)} {...props}>
        <path
          d="M8.00004 1.33325L10.06 5.50659L14.6667 6.17992L11.3334 9.42659L12.12 14.0133L8.00004 11.8466L3.88004 14.0133L4.66671 9.42659L1.33337 6.17992L5.94004 5.50659L8.00004 1.33325Z"
          fill="#FB923C"
          stroke="#FB923C"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)} {...props}>
      <path
        d="M7.99992 1.33325L10.0599 5.50659L14.6666 6.17992L11.3333 9.42659L12.1199 14.0133L7.99992 11.8466L3.87992 14.0133L4.66659 9.42659L1.33325 6.17992L5.93992 5.50659L7.99992 1.33325Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FilterIconFavorites({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0 text-[#F97316]", className)} {...props}>
      <path
        d="M8.00004 1.3335L10.06 5.50683L14.6667 6.18016L11.3334 9.42683L12.12 14.0135L8.00004 11.8468L3.88004 14.0135L4.66671 9.42683L1.33337 6.18016L5.94004 5.50683L8.00004 1.3335Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconEdit16({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path
        d="M9.99992 3.33333L12.6666 6M14.1159 4.54126C14.4683 4.18888 14.6664 3.71091 14.6665 3.2125C14.6665 2.71409 14.4686 2.23607 14.1162 1.8836C13.7638 1.53112 13.2859 1.33307 12.7874 1.33301C12.289 1.33295 11.811 1.53088 11.4585 1.88326L2.56121 10.7826C2.40642 10.9369 2.29195 11.127 2.22787 11.3359L1.34721 14.2373C1.32998 14.2949 1.32868 14.3562 1.34344 14.4145C1.35821 14.4728 1.38849 14.5261 1.43107 14.5686C1.47366 14.6111 1.52696 14.6413 1.58531 14.656C1.64367 14.6707 1.70491 14.6693 1.76254 14.6519L4.66454 13.7719C4.87332 13.7084 5.06332 13.5947 5.21787 13.4406L14.1159 4.54126Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FilterIconArchived({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0 text-muted-foreground", className)} {...props}>
      <path
        d="M2.5 5.50011V12.1668C2.5 12.5204 2.6295 12.8595 2.86002 13.1096C3.09053 13.3596 3.40318 13.5001 3.72917 13.5001H11.2708C12.5968 13.5001 12.9095 13.3596 13.14 13.1096C13.3705 12.8595 13.5 12.5204 13.5 12.1668V5.50011M6.49996 8.50011H9.49996M2.16667 2.0001L13.8333 2.00002C14.2015 2.00002 14.5 2.29849 14.5 2.66668V4.66668C14.5 5.03487 14.2015 5.50002 13.8333 5.50002L8 5.50011L2.16667 5.5001C1.79848 5.5001 1.5 5.03496 1.5 4.66677V2.66677C1.5 2.29858 1.79848 2.0001 2.16667 2.0001Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MoreVerticalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path
        d="M7.99992 8.00008C8.36811 8.00008 8.66659 7.7016 8.66659 7.33341C8.66659 6.96522 8.36811 6.66675 7.99992 6.66675C7.63173 6.66675 7.33325 6.96522 7.33325 7.33341C7.33325 7.7016 7.63173 8.00008 7.99992 8.00008Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.99992 4.00008C8.36811 4.00008 8.66659 3.7016 8.66659 3.33341C8.66659 2.96522 8.36811 2.66675 7.99992 2.66675C7.63173 2.66675 7.33325 2.96522 7.33325 3.33341C7.33325 3.7016 7.63173 4.00008 7.99992 4.00008Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.99992 13.3334C8.36811 13.3334 8.66659 13.0349 8.66659 12.6667C8.66659 12.2986 8.36811 12.0001 7.99992 12.0001C7.63173 12.0001 7.33325 12.2986 7.33325 12.6667C7.33325 13.0349 7.63173 13.3334Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const iconGroupButtonClassName = cn(
  buttonVariants({ variant: "outline", size: "icon" }),
  controlGroupItemFixedClassName,
  "!size-9 !min-h-9 !min-w-9",
);

const editButtonClassName = cn(buttonVariants({ variant: "outline", size: "sm" }), controlGroupItemFixedClassName, "!h-9 gap-2");

type ExtensionItemDetailPaneProps = {
  item: ItemPlaintextV2;
  emptyLabel: string;
  onCopy: (value: string, label: string) => void;
  onEdit: () => void;
  onCreateCapsule: () => void;
  onFavoriteInWeb: () => void;
  onArchiveInWeb: () => void;
  onOpenInWeb: () => void;
  t: (key: string) => string;
};

export function ExtensionItemDetailPane(props: ExtensionItemDetailPaneProps) {
  const { item, onCopy, onEdit, onCreateCapsule, onFavoriteInWeb, onArchiveInWeb, onOpenInWeb, t } = props;
  const fields = extractReadableItemFields(item);
  const archived = item.archived ?? false;
  const deleted = item.deleted ?? false;
  const favoriteTooltip = t("web.items.detail.favoriteAddTooltip");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-w-0 shrink-0 items-center gap-2 border-b border-border py-2 pl-2 pr-2">
        <div className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.title || "—"}</div>
        <div className="flex shrink-0 items-center gap-2">
          {!archived && !deleted ? (
            <ControlGroup aria-label={t("web.items.detail.capsuleFavoriteGroupAria")} className="w-auto shrink-0">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className={iconGroupButtonClassName}
                      aria-label={t("web.nav.addCapsule")}
                      onClick={onCreateCapsule}
                    >
                      <IconCapsule16 />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("web.nav.addCapsule")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className={iconGroupButtonClassName}
                      aria-label={favoriteTooltip}
                      onClick={onFavoriteInWeb}
                    >
                      <IconFavorite16 />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{favoriteTooltip}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </ControlGroup>
          ) : null}

          <ControlGroup aria-label={t("web.items.detail.editActionsGroupAria")} className="w-auto shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={editButtonClassName}
              disabled={archived || deleted}
              onClick={onEdit}
            >
              <IconEdit16 />
              <span>{t("web.items.menu.edit")}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={iconGroupButtonClassName} aria-label={t("web.items.detail.moreActionsAria")}>
                  <MoreVerticalIcon />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 p-1">
                {!archived && !deleted ? (
                  <>
                    <DropdownMenuItem className="gap-2" onSelect={onFavoriteInWeb}>
                      <FilterIconFavorites className="size-4 shrink-0 text-foreground" />
                      <span>{t("web.items.menu.addToFavorites")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2" onSelect={onCreateCapsule}>
                      <IconCapsule16 />
                      <span>{t("web.nav.addCapsule")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="mx-1 my-1" />
                  </>
                ) : null}
                {!deleted ? (
                  <DropdownMenuItem className="gap-2" onSelect={onArchiveInWeb}>
                    <FilterIconArchived className="size-4 shrink-0 text-foreground" />
                    <span>{archived ? t("web.items.menu.unarchive") : t("web.items.menu.archive")}</span>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem className="gap-2" onSelect={onOpenInWeb}>
                  <KeyFieldCopyIcon className="size-4 shrink-0 text-foreground" />
                  <span>{t("extension.vault.openInWeb")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ControlGroup>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 p-3">
        <div className="flex flex-col gap-3">
          <KeyForm mode="view">
            {fields.map((field) => (
              <KeyField
                key={field.id}
                mode="view"
                label={field.label}
                value={field.conceal ? undefined : field.value}
                concealValue={field.conceal}
                copyValue={field.copyable ? field.value : undefined}
                copyLabel={t("extension.vault.copy")}
                copySuccessLabel={t("extension.vault.copied")}
                onCopyAction={
                  field.copyable
                    ? async (value) => {
                        onCopy(value, field.label);
                      }
                    : undefined
                }
              />
            ))}
          </KeyForm>
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("extension.vault.noFields")}</p>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

export function ExtensionItemDetailEmpty(props: { workspaceName?: string; selectLabel: string; workspaceFallback: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-sm text-muted-foreground">
      <p>{props.workspaceName ?? props.workspaceFallback}</p>
      <p>{props.selectLabel}</p>
    </div>
  );
}
