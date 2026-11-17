import type { WebMessageValues } from "@okkey/i18n";
import type { PopupMenu } from "@okkey/ui";

import type { WorkspaceSettingsSectionId } from "./workspaceSettingsCatalog";
import { webDeploymentMode } from "../../../workspace/planEntitlements";
import {
  BillingIcon,
  CapsulesIcon,
  GeneralIcon,
  ItemsIcon,
  MailIcon,
  MembersIcon,
  PlanIcon,
  ProfilesIcon,
  RolesIcon,
  VaultsIcon,
} from "./workspaceSettingsIcons";

export const WORKSPACE_SETTINGS_SECTIONS: WorkspaceSettingsSectionId[] = [
  "general",
  "mail",
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
 * Mail is self-host only (server SMTP settings).
 */
export const WORKSPACE_SETTINGS_HIDDEN_SECTIONS: readonly WorkspaceSettingsSectionId[] = [
  "billing",
];

export function isWorkspaceSettingsSectionVisible(
  section: WorkspaceSettingsSectionId,
): boolean {
  if (WORKSPACE_SETTINGS_HIDDEN_SECTIONS.includes(section)) {
    return false;
  }
  if (section === "mail" && webDeploymentMode() === "saas") {
    return false;
  }
  return true;
}

/** Top-level sidebar / mobile menu entries. */
export const WORKSPACE_SETTINGS_TOP_LEVEL_SECTIONS: WorkspaceSettingsSectionId[] =
  WORKSPACE_SETTINGS_SECTIONS.filter(isWorkspaceSettingsSectionVisible);

export function workspaceSettingsSectionIcon(section: WorkspaceSettingsSectionId) {
  switch (section) {
    case "general":
      return GeneralIcon;
    case "mail":
      return MailIcon;
    case "items":
      return ItemsIcon;
    case "capsules":
      return CapsulesIcon;
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
