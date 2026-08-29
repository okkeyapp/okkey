import type { WebMessageValues } from "@okkey/i18n";
import { cn } from "@okkey/ui";
import { Link } from "react-router-dom";

import { TOOLS_SECTIONS, type ToolsSectionId } from "../../../routes/paths";
import { toolsSectionIcon } from "./toolsMenu";

type ToolsSidebarProps = {
  activeSection: ToolsSectionId;
  t: (messageKey: string, values?: WebMessageValues) => string;
  sectionHref: (section: ToolsSectionId) => string;
};

const navLinkClassName = (active: boolean) =>
  cn(
    "flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground transition-colors",
    active ? "bg-secondary font-medium" : "hover:bg-muted/80",
  );

export default function ToolsSidebar({ activeSection, t, sectionHref }: ToolsSidebarProps) {
  return (
    <nav className="hidden w-[240px] shrink-0 self-stretch p-2 md:block" aria-label={t("web.tools.sidebarAria")}>
      <ul className="flex flex-col gap-1">
        {TOOLS_SECTIONS.map((section) => {
          const Icon = toolsSectionIcon(section);
          const sectionActive = section === activeSection;

          return (
            <li key={section}>
              <Link
                to={sectionHref(section)}
                className={navLinkClassName(sectionActive)}
                aria-current={sectionActive ? "page" : undefined}
              >
                <Icon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{t(`web.tools.sections.${section}`)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
