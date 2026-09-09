import type { WebMessageValues } from "@okkey/i18n";
import type { Vault } from "@okkey/types";
import {
  Breadcrumb,
  BreadcrumbBar,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@okkey/ui";
import { useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { useScrollAncestorScrolled } from "../../../hooks/useRadixScrollAreaScrolled";
import { useLocale } from "../../../locale/LocaleContext";
import {
  DEFAULT_TOOLS_SECTION,
  TOOLS_GENERATOR_PATH,
  itemsPathAllWorkspaceMerged,
  toolsPath,
  toolsSectionFromSlug,
  type ToolsSectionId,
} from "../../../routes/paths";
import GeneratorSection from "./generator/GeneratorSection";
import ImportSection from "./import/ImportSection";
import ExportSection from "./export/ExportSection";
import ToolsMobileHeader from "./ToolsMobileHeader";
import ToolsSidebar from "./ToolsSidebar";

type ToolsPageProps = {
  workspaceName: string;
  vaults: readonly Vault[];
  vaultsListReady: boolean;
};

function ToolsPlaceholderSection({
  section,
  t,
}: {
  section: ToolsSectionId;
  t: (messageKey: string, values?: WebMessageValues) => string;
}) {
  return (
    <div className="flex min-h-[240px] flex-col gap-2">
      <h2 className="text-lg font-semibold text-foreground">{t(`web.tools.sections.${section}`)}</h2>
      <p className="text-sm text-muted-foreground">{t("web.tools.comingSoon")}</p>
    </div>
  );
}

export default function ToolsPage({ workspaceName, vaults, vaultsListReady }: ToolsPageProps) {
  const { t } = useLocale();
  const { sectionSlug = "" } = useParams<{ sectionSlug: string }>();
  const [searchParams] = useSearchParams();
  const activeSection: ToolsSectionId = toolsSectionFromSlug(sectionSlug) ?? DEFAULT_TOOLS_SECTION;
  const itemsHref = itemsPathAllWorkspaceMerged(searchParams);
  const sectionHref = (section: ToolsSectionId) => toolsPath(section);
  const pageRootRef = useRef<HTMLDivElement>(null);
  const headerScrolled = useScrollAncestorScrolled(pageRootRef, 0, activeSection);

  return (
    <div ref={pageRootRef} className="flex min-h-full min-w-0 flex-1 flex-col">
      <BreadcrumbBar>
        <Breadcrumb aria-label={t("web.tools.breadcrumbsAria")}>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={itemsHref} title={workspaceName}>
                  <span className="truncate">{workspaceName}</span>
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={TOOLS_GENERATOR_PATH} title={t("web.tools.breadcrumbsRoot")}>
                  <span className="truncate">{t("web.tools.breadcrumbsRoot")}</span>
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage title={t(`web.tools.sections.${activeSection}`)}>
                {t(`web.tools.sections.${activeSection}`)}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </BreadcrumbBar>

      <ToolsMobileHeader
        activeSection={activeSection}
        itemsHref={itemsHref}
        headerScrolled={headerScrolled}
        t={t}
        sectionHref={sectionHref}
      />

      <div className="flex flex-1 flex-col items-center px-4 py-6 md:px-6 md:pb-8 md:pt-8">
        <div className="flex w-full max-w-[900px] flex-col gap-4 md:flex-row">
          <ToolsSidebar activeSection={activeSection} t={t} sectionHref={sectionHref} />
          <main className="min-w-0 flex-1">
            {activeSection === "generator" ? (
              <GeneratorSection />
            ) : activeSection === "import" ? (
              <ImportSection
                workspaceName={workspaceName}
                vaults={vaults}
                vaultsListReady={vaultsListReady}
              />
            ) : activeSection === "export" ? (
              <ExportSection
                workspaceName={workspaceName}
                vaults={vaults}
                vaultsListReady={vaultsListReady}
              />
            ) : (
              <ToolsPlaceholderSection section={activeSection} t={t} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
