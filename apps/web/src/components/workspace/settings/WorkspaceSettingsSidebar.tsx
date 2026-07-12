import type { WebMessageValues } from "@okkey/i18n";
import { cn } from "@okkey/ui";
import { Link } from "react-router-dom";

import type { WorkspaceSettingsSectionId } from "./workspaceSettingsCatalog";
import {
  BillingIcon,
  GeneralIcon,
  MembersIcon,
  PlanIcon,
  ProfilesIcon,
  RolesIcon,
  VaultsIcon,
} from "./workspaceSettingsIcons";

type WorkspaceSettingsSidebarProps = {
  activeSection: WorkspaceSettingsSectionId;
  t: (messageKey: string, values?: WebMessageValues) => string;
  sectionHref: (section: WorkspaceSettingsSectionId) => string;
};

const SECTIONS: WorkspaceSettingsSectionId[] = [
  "general",
  "roles",
  "profiles",
  "members",
  "vaults",
  "plan",
  "billing",
];

function sectionIcon(section: WorkspaceSettingsSectionId) {
  switch (section) {
    case "general":
      return GeneralIcon;
    case "roles":
      return RolesIcon;
    case "profiles":
      return ProfilesIcon;
    case "members":
      return MembersIcon;
    case "vaults":
      return VaultsIcon;
    case "plan":
      return PlanIcon;
    case "billing":
      return BillingIcon;
    default:
      return GeneralIcon;
  }
}

export default function WorkspaceSettingsSidebar({
  activeSection,
  t,
  sectionHref,
}: WorkspaceSettingsSidebarProps) {
  return (
    <nav className="w-[240px] shrink-0 self-stretch p-2" aria-label={t("web.workspaceSettings.sidebarAria")}>
      <ul className="flex flex-col gap-1">
        {SECTIONS.map((section) => {
          const Icon = sectionIcon(section);
          const active = section === activeSection;
          return (
            <li key={section}>
              <Link
                to={sectionHref(section)}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground transition-colors",
                  active ? "bg-secondary font-medium" : "hover:bg-muted/80",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{t(`web.workspaceSettings.sections.${section}`)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
