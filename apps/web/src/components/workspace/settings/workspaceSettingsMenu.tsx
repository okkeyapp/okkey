import type { WebMessageValues } from "@okkey/i18n";
import type { PopupMenu } from "@okkey/ui";

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

export const WORKSPACE_SETTINGS_SECTIONS: WorkspaceSettingsSectionId[] = [
  "general",
  "roles",
  "profiles",
  "members",
  "vaults",
  "plan",
  "billing",
];

export function workspaceSettingsSectionIcon(section: WorkspaceSettingsSectionId) {
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

type BuildWorkspaceSettingsMenuOptions = {
  activeSection: WorkspaceSettingsSectionId;
  t: (messageKey: string, values?: WebMessageValues) => string;
  withMenuLabel?: boolean;
  onSectionSelect: (section: WorkspaceSettingsSectionId) => void;
};

export function buildWorkspaceSettingsMenu({
  activeSection,
  t,
  withMenuLabel = false,
  onSectionSelect,
}: BuildWorkspaceSettingsMenuOptions): PopupMenu {
  return {
    label: withMenuLabel ? t("web.workspaceSettings.breadcrumbsRoot") : undefined,
    activeItemId: activeSection,
    items: WORKSPACE_SETTINGS_SECTIONS.map((section) => {
      const Icon = workspaceSettingsSectionIcon(section);
      return {
        id: section,
        label: t(`web.workspaceSettings.sections.${section}`),
        icon: <Icon className="size-4" />,
        onSelect: () => onSectionSelect(section),
      };
    }),
  };
}
