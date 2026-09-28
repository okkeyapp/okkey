import type { WebMessageValues } from "@okkey/i18n";
import type { PopupMenu } from "@okkey/ui";

import type { WorkspaceSettingsSectionId } from "./workspaceSettingsCatalog";
import {
  isWorkspaceSettingsGeneralSubsection,
  WORKSPACE_SETTINGS_GENERAL_SUBSECTIONS,
} from "./workspaceSettingsCatalog";
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
  "items",
  "capsules",
  "roles",
  "profiles",
  "members",
  "vaults",
  "plan",
  "billing",
];

/**
 * Billing & invoices UI is temporarily hidden (nav + routes redirect).
 * Keep `billing` in {@link WORKSPACE_SETTINGS_SECTIONS} / types so RBAC and deep links stay intact.
 */
export const WORKSPACE_SETTINGS_HIDDEN_SECTIONS: readonly WorkspaceSettingsSectionId[] = [
  "billing",
];

export function isWorkspaceSettingsSectionVisible(
  section: WorkspaceSettingsSectionId,
): boolean {
  return !WORKSPACE_SETTINGS_HIDDEN_SECTIONS.includes(section);
}

/** Top-level sidebar entries (general subsections are nested under general). */
export const WORKSPACE_SETTINGS_TOP_LEVEL_SECTIONS: WorkspaceSettingsSectionId[] =
  WORKSPACE_SETTINGS_SECTIONS.filter(
    (section) =>
      !isWorkspaceSettingsGeneralSubsection(section) && isWorkspaceSettingsSectionVisible(section),
  );

export { WORKSPACE_SETTINGS_GENERAL_SUBSECTIONS, isWorkspaceSettingsGeneralSubsection };

export function workspaceSettingsSectionIcon(section: WorkspaceSettingsSectionId) {
  switch (section) {
    case "general":
    case "items":
    case "capsules":
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
  /** When set, only these sections appear in the menu. */
  allowedSections?: readonly WorkspaceSettingsSectionId[];
};

export function buildWorkspaceSettingsMenu({
  activeSection,
  t,
  withMenuLabel = false,
  onSectionSelect,
  allowedSections = WORKSPACE_SETTINGS_SECTIONS,
}: BuildWorkspaceSettingsMenuOptions): PopupMenu {
  return {
    label: withMenuLabel ? t("web.workspaceSettings.breadcrumbsRoot") : undefined,
    activeItemId: activeSection,
    items: allowedSections.map((section) => {
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
