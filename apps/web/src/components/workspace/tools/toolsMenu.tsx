import type { WebMessageValues } from "@okkey/i18n";
import type { PopupMenu } from "@okkey/ui";

import { TOOLS_SECTIONS, type ToolsSectionId } from "../../../routes/paths";
import { ExportIcon, GeneratorIcon, ImportIcon } from "./toolsIcons";

export function toolsSectionIcon(section: ToolsSectionId) {
  switch (section) {
    case "generator":
      return GeneratorIcon;
    case "import":
      return ImportIcon;
    case "export":
      return ExportIcon;
    default:
      return GeneratorIcon;
  }
}

type BuildToolsMenuOptions = {
  activeSection: ToolsSectionId;
  t: (messageKey: string, values?: WebMessageValues) => string;
  withMenuLabel?: boolean;
  onSectionSelect: (section: ToolsSectionId) => void;
};

export function buildToolsMenu({
  activeSection,
  t,
  withMenuLabel = false,
  onSectionSelect,
}: BuildToolsMenuOptions): PopupMenu {
  return {
    label: withMenuLabel ? t("web.tools.breadcrumbsRoot") : undefined,
    activeItemId: activeSection,
    items: TOOLS_SECTIONS.map((section) => {
      const Icon = toolsSectionIcon(section);
      return {
        id: section,
        label: t(`web.tools.sections.${section}`),
        icon: <Icon className="size-4" />,
        onSelect: () => onSectionSelect(section),
      };
    }),
  };
}
