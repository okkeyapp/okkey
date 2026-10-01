import type { ReactNode, SVGProps } from "react";

import { cn } from "../../lib/utils.js";
import { Button, buttonVariants } from "../ui/button.js";
import { ControlGroup, controlGroupItemFixedClassName } from "../ui/control-group.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.js";
import { KeyFieldCopyIcon } from "../ui/key-field.js";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip.js";
import { FilterIconArchived, FilterIconFavorites } from "./items-list-filter-icons.js";

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

function IconUnfavorite16({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path d="M2 2L14 14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M6.67468 4.01047L7.99535 1.33447L10.0527 5.50314L14.6527 6.16981L11.7053 9.03914M11.7133 11.7125L12.1053 13.9965L8.00001 11.8331L3.88535 13.9965L4.67135 9.41447L1.33801 6.16981L5.55601 5.55847"
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

function IconUnarchive16({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path
        d="M5.33327 2.6665H12.6666C13.0202 2.6665 13.3594 2.80698 13.6094 3.05703C13.8595 3.30708 13.9999 3.64622 13.9999 3.99984C13.9999 4.35346 13.8595 4.6926 13.6094 4.94265C13.3594 5.19269 13.0202 5.33317 12.6666 5.33317H7.99994M5.33327 5.33317H3.33327C3.02844 5.33335 2.73274 5.22907 2.49546 5.03771C2.25818 4.84634 2.09363 4.57945 2.02923 4.28149C1.96484 3.98353 2.00449 3.67251 2.14157 3.40024C2.27866 3.12796 2.5049 2.91089 2.78261 2.78517"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.33337 5.3335V12.0002C3.33337 12.3538 3.47385 12.6929 3.7239 12.943C3.97395 13.193 4.31309 13.3335 4.66671 13.3335H11.3334C11.5903 13.3335 11.8418 13.2592 12.0575 13.1197C12.2732 12.9801 12.444 12.7812 12.5494 12.5468M12.6667 10.0002V5.3335"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6.66663 8H7.99996" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 2L14 14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDelete16({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path
        d="M2 3.99992H14M12.6667 3.99992V13.3333C12.6667 13.9999 12 14.6666 11.3333 14.6666H4.66667C4 14.6666 3.33333 13.9999 3.33333 13.3333V3.99992M5.33333 3.99992V2.66659C5.33333 1.99992 6 1.33325 6.66667 1.33325H9.33333C10 1.33325 10.6667 1.99992 10.6667 2.66659V3.99992M6.66667 7.33325V11.3333M9.33333 7.33325V11.3333"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconRestore16({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path d="M2 2L14 14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.66663 4.6665H4.66663M7.33329 4.6665H13.3333" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.66663 7.3335V11.3335" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.33337 9.3335V11.3335" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M3.33337 4.6665L4.00004 12.6665C4.00004 13.0201 4.14052 13.3593 4.39056 13.6093C4.64061 13.8594 4.97975 13.9998 5.33337 13.9998H10.6667C11.0203 13.9998 11.3595 13.8594 11.6095 13.6093C11.8596 13.3593 12 13.0201 12 12.6665L12.0514 12.0512"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12.256 9.58184L12.6666 4.6665" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M6 3.33333V2.66667C6 2.48986 6.07024 2.32029 6.19526 2.19526C6.32029 2.07024 6.48986 2 6.66667 2H9.33333C9.51014 2 9.67971 2.07024 9.80474 2.19526C9.92976 2.32029 10 2.48986 10 2.66667V4.66667"
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
        d="M7.99992 13.3334C8.36811 13.3334 8.66659 13.0349 8.66659 12.6667C8.66659 12.2986 8.36811 12.0001 7.99992 12.0001C7.63173 12.0001 7.33325 12.2986 7.33325 12.6667C7.33325 13.0349 7.63173 13.3334 7.99992 13.3334Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BackChevronGlyph({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden className={cn("size-4 shrink-0", className)} {...props}>
      <path d="M10 12L6 8L10 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** External-link / open-website glyph (24 viewBox; size via className). */
function IconExternalLink16({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      {...props}
    >
      <path
        d="M21 9V3H15M21 3L10 14M18 13V19C18 19.5304 17.7893 20.0391 17.4142 20.4142C17.0391 20.7893 16.5304 21 16 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V8C3 7.46957 3.21071 6.96086 3.58579 6.58579C3.96086 6.21071 4.46957 6 5 6H11"
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

const actionsTextButtonClassName = cn(
  buttonVariants({ variant: "outline", size: "sm" }),
  controlGroupItemFixedClassName,
  "!h-9 gap-2 shrink-0 px-3",
);

const openWebsiteButtonClassName = cn(
  buttonVariants({ variant: "default", size: "sm" }),
  "!h-9 gap-2 shrink-0",
);

const mobileBackButtonClassName = cn(
  buttonVariants({ variant: "secondary", size: "iconSm" }),
  "!size-7 !min-h-7 !min-w-7 shrink-0 rounded-md md:hidden",
);

const controlGroupLayoutClassName = "w-auto shrink-0";

export type ItemDetailActionsBarTranslate = (
  messageKey: string,
  values?: Record<string, string | number | boolean | Date | null | undefined>,
) => string;

export type ItemDetailActionsBarProps = {
  t: ItemDetailActionsBarTranslate;
  favorite: boolean;
  archived: boolean;
  deleted: boolean;
  headerScrolled?: boolean;
  /** Optional custom leading content (takes precedence over showBack). */
  leading?: ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  onEdit: () => void;
  onCopy?: () => void;
  onToggleFavorite: () => void;
  onToggleArchive: () => void;
  onToggleDelete: () => void;
  canEdit?: boolean;
  canFavorite?: boolean;
  canArchive?: boolean;
  canDelete?: boolean;
  canCreateCapsule?: boolean;
  onCreateCapsule?: () => void;
  /** Extension: open current item in web app. */
  openInWebLabel?: string;
  onOpenInWeb?: () => void;
  /** Login/password: open first website URL (primary CTA). */
  openWebsiteLabel?: string;
  onOpenWebsite?: () => void;
  className?: string;
};

/**
 * Presentational item detail actions bar (favorite + actions; open CTA optional).
 * No vault/folder breadcrumbs — hosts supply optional `leading` or `showBack`.
 */
export function ItemDetailActionsBar({
  t,
  favorite,
  archived,
  deleted,
  headerScrolled = false,
  leading,
  showBack = false,
  onBack,
  onEdit,
  onCopy,
  onToggleFavorite,
  onToggleArchive,
  onToggleDelete,
  canEdit = true,
  canFavorite = true,
  canArchive = true,
  canDelete = true,
  canCreateCapsule = true,
  onCreateCapsule,
  openInWebLabel,
  onOpenInWeb,
  openWebsiteLabel,
  onOpenWebsite,
  className,
}: ItemDetailActionsBarProps) {
  const favoriteTooltip = favorite
    ? t("web.items.detail.favoriteRemoveTooltip")
    : t("web.items.detail.favoriteAddTooltip");
  const editLabel = t("web.items.menu.edit");
  const showOpenWebsite = Boolean(openWebsiteLabel && onOpenWebsite);

  const showMenuEdit = canEdit;
  const showMenuCreateCapsule = !archived && !deleted && canCreateCapsule;
  const showMenuFavorite = !archived && !deleted && canFavorite;
  const showMenuCopy = !archived && !deleted && Boolean(onCopy);
  const showMenuArchive = !deleted && canArchive;
  const showMenuDelete = canDelete;
  const showMenuOpenInWeb = Boolean(openInWebLabel && onOpenInWeb);
  const menuSection1 = showMenuEdit || showMenuCreateCapsule;
  const menuSection2 = showMenuFavorite || showMenuCopy || showMenuArchive || showMenuDelete;
  const menuSection3 = showMenuOpenInWeb;

  const leadingContent =
    leading ??
    (showBack && onBack ? (
      <Button
        type="button"
        variant="secondary"
        size="iconSm"
        className={mobileBackButtonClassName}
        aria-label={t("web.items.detail.back")}
        onClick={onBack}
      >
        <BackChevronGlyph />
      </Button>
    ) : null);

  return (
    <div
      className={cn(
        "sticky top-0 z-sticky bg-background transition-shadow",
        headerScrolled && "shadow-[0_1px_3px_rgba(0,0,0,0.1)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
        "flex min-w-0 items-center gap-3 border-b border-border py-2 pl-2 pr-2 md:pl-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {leadingContent}
        {showOpenWebsite ? (
          <Button
            type="button"
            variant="default"
            size="sm"
            className={openWebsiteButtonClassName}
            onClick={onOpenWebsite}
          >
            <IconExternalLink16 />
            <span>{openWebsiteLabel}</span>
          </Button>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ControlGroup aria-label={t("web.items.detail.favoriteActionsGroupAria")} className={controlGroupLayoutClassName}>
          {!archived && !deleted && canFavorite ? (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={iconGroupButtonClassName}
                    aria-label={favoriteTooltip}
                    aria-pressed={favorite}
                    onClick={onToggleFavorite}
                  >
                    <IconFavorite16 filled={favorite} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{favoriteTooltip}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={actionsTextButtonClassName}>
                <span>{t("web.items.list.actions")}</span>
                <MoreVerticalIcon />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 p-1">
              {/* Section 1: Edit / Create capsule (leave to website) */}
              {showMenuEdit ? (
                <DropdownMenuItem className="gap-2" onSelect={onEdit}>
                  <IconEdit16 />
                  <span>{editLabel}</span>
                  <IconExternalLink16 className="ml-auto size-4 shrink-0 text-muted-foreground" />
                </DropdownMenuItem>
              ) : null}
              {showMenuCreateCapsule ? (
                <DropdownMenuItem className="gap-2" onSelect={onCreateCapsule}>
                  <IconCapsule16 />
                  <span>{t("web.nav.addCapsule")}</span>
                  <IconExternalLink16 className="ml-auto size-4 shrink-0 text-muted-foreground" />
                </DropdownMenuItem>
              ) : null}

              {menuSection1 && menuSection2 ? <DropdownMenuSeparator className="mx-1 my-1" /> : null}

              {/* Section 2: Favorite / Archive / Delete (local mutations) */}
              {showMenuFavorite ? (
                <DropdownMenuItem className="gap-2" onSelect={onToggleFavorite}>
                  {favorite ? (
                    <IconUnfavorite16 className="text-foreground" />
                  ) : (
                    <FilterIconFavorites className="size-4 shrink-0 text-foreground" />
                  )}
                  <span>
                    {favorite ? t("web.items.menu.removeFromFavorites") : t("web.items.menu.addToFavorites")}
                  </span>
                </DropdownMenuItem>
              ) : null}
              {showMenuCopy && onCopy ? (
                <DropdownMenuItem className="gap-2" onSelect={onCopy}>
                  <KeyFieldCopyIcon className="size-4 shrink-0 text-foreground" />
                  <span>{t("web.items.menu.copy")}</span>
                </DropdownMenuItem>
              ) : null}
              {showMenuArchive ? (
                <DropdownMenuItem className="gap-2" onSelect={onToggleArchive}>
                  {archived ? (
                    <IconUnarchive16 className="text-foreground" />
                  ) : (
                    <FilterIconArchived className="size-4 shrink-0 text-foreground" />
                  )}
                  <span>{archived ? t("web.items.menu.unarchive") : t("web.items.menu.archive")}</span>
                </DropdownMenuItem>
              ) : null}
              {showMenuDelete ? (
                <DropdownMenuItem
                  className={cn(
                    "gap-2",
                    !deleted && "text-destructive data-[highlighted]:bg-destructive/15 data-[highlighted]:text-destructive",
                  )}
                  onSelect={onToggleDelete}
                >
                  {deleted ? <IconRestore16 className="text-foreground" /> : <IconDelete16 />}
                  <span>{deleted ? t("web.items.menu.restore") : t("web.items.menu.delete")}</span>
                </DropdownMenuItem>
              ) : null}

              {(menuSection1 || menuSection2) && menuSection3 ? (
                <DropdownMenuSeparator className="mx-1 my-1" />
              ) : null}

              {/* Section 3: Open in web */}
              {showMenuOpenInWeb ? (
                <DropdownMenuItem className="gap-2" onSelect={onOpenInWeb}>
                  <IconExternalLink16 className="text-foreground" />
                  <span>{openInWebLabel}</span>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </ControlGroup>
      </div>
    </div>
  );
}
