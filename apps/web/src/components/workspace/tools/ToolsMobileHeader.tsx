import type { WebMessageValues } from "@okkey/i18n";
import { Button, PopupMobileMenu, buttonVariants, cn } from "@okkey/ui";
import { Link, useNavigate } from "react-router-dom";

import type { ToolsSectionId } from "../../../routes/paths";
import { BackChevronIcon } from "../../items/itemCategoryIcons";
import { stickyHeaderShadowClassName, stickyHeaderSurfaceClassName } from "../stickyHeaderShadow";
import { buildToolsMenu } from "./toolsMenu";

const mobileBackButtonClassName = cn(
  buttonVariants({ variant: "secondary", size: "iconSm" }),
  "!size-7 !min-h-7 !min-w-7 shrink-0 rounded-md",
);

type ToolsMobileHeaderProps = {
  activeSection: ToolsSectionId;
  itemsHref: string;
  headerScrolled?: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  sectionHref: (section: ToolsSectionId) => string;
};

export default function ToolsMobileHeader({
  activeSection,
  itemsHref,
  headerScrolled = false,
  t,
  sectionHref,
}: ToolsMobileHeaderProps) {
  const navigate = useNavigate();

  const menu = buildToolsMenu({
    activeSection,
    t,
    withMenuLabel: true,
    onSectionSelect: (section) => navigate(sectionHref(section)),
  });

  return (
    <header
      className={cn(
        stickyHeaderSurfaceClassName,
        stickyHeaderShadowClassName(headerScrolled),
        "top-0 box-border flex h-[53px] shrink-0 items-center gap-2 border-b border-border py-2 pl-2 pr-2 md:hidden",
      )}
    >
      <Button asChild variant="secondary" size="iconSm" className={mobileBackButtonClassName}>
        <Link to={itemsHref} aria-label={t("web.items.detail.back")}>
          <BackChevronIcon />
        </Link>
      </Button>
      <div className="min-w-0 flex-1">
        <PopupMobileMenu menu={menu} />
      </div>
    </header>
  );
}
