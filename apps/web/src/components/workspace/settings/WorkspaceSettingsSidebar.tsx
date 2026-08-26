import type { WebMessageValues } from "@okkey/i18n";
import { Link } from "react-router-dom";

import type { WorkspaceSettingsSectionId } from "./workspaceSettingsCatalog";
import {
  WORKSPACE_SETTINGS_GENERAL_SUBSECTIONS,
  WORKSPACE_SETTINGS_TOP_LEVEL_SECTIONS,
  workspaceSettingsSectionIcon,
} from "./workspaceSettingsMenu";
import { cn } from "@okkey/ui";

type WorkspaceSettingsSidebarProps = {
  activeSection: WorkspaceSettingsSectionId;
  t: (messageKey: string, values?: WebMessageValues) => string;
  sectionHref: (section: WorkspaceSettingsSectionId) => string;
  allowedSections?: readonly WorkspaceSettingsSectionId[];
};

const navLinkClassName = (active: boolean) =>
  cn(
    "flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground transition-colors",
    active ? "bg-secondary font-medium" : "hover:bg-muted/80",
  );

export default function WorkspaceSettingsSidebar({
  activeSection,
  t,
  sectionHref,
  allowedSections,
}: WorkspaceSettingsSidebarProps) {
  const allowed = new Set(allowedSections ?? WORKSPACE_SETTINGS_TOP_LEVEL_SECTIONS);
  const generalSubsections = WORKSPACE_SETTINGS_GENERAL_SUBSECTIONS.filter((section) =>
    allowed.has(section),
  );
  const showGeneralGroup = allowed.has("general") || generalSubsections.length > 0;
  const topLevelSections = WORKSPACE_SETTINGS_TOP_LEVEL_SECTIONS.filter((section) => {
    if (section === "general") {
      return showGeneralGroup;
    }
    return allowed.has(section);
  });

  return (
    <nav
      className="hidden w-[240px] shrink-0 self-stretch p-2 md:block"
      aria-label={t("web.workspaceSettings.sidebarAria")}
    >
      <ul className="flex flex-col gap-1">
        {topLevelSections.map((section) => {
          const Icon = workspaceSettingsSectionIcon(section);
          const sectionActive = section === activeSection;
          const showSubsections = section === "general" && generalSubsections.length > 0;
          const canOpenGeneral = section !== "general" || allowed.has("general");

          return (
            <li key={section}>
              {canOpenGeneral ? (
                <Link
                  to={sectionHref(section)}
                  className={navLinkClassName(sectionActive)}
                  aria-current={sectionActive ? "page" : undefined}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {t(`web.workspaceSettings.sections.${section}`)}
                  </span>
                </Link>
              ) : (
                <div className={cn(navLinkClassName(false), "cursor-default hover:bg-transparent")}>
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {t(`web.workspaceSettings.sections.${section}`)}
                  </span>
                </div>
              )}

              {showSubsections ? (
                <div className="relative mt-1">
                  <div className="absolute bottom-1 left-3 top-1 w-px bg-border" aria-hidden />
                  <ul
                    className="flex flex-col gap-1"
                    aria-label={t("web.workspaceSettings.generalSubnavAria")}
                  >
                    {generalSubsections.map((subSection) => {
                      const subActive = subSection === activeSection;
                      return (
                        <li key={subSection}>
                          <Link
                            to={sectionHref(subSection)}
                            className={navLinkClassName(subActive)}
                            aria-current={subActive ? "page" : undefined}
                          >
                            <span className="size-4 shrink-0" aria-hidden />
                            <span className="min-w-0 flex-1 truncate">
                              {t(`web.workspaceSettings.sections.${subSection}`)}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
