import type { WebMessageValues } from "@okkey/i18n";
import type { WorkspaceBuiltInRoleId, WorkspaceRoleSummary } from "@okkey/types";
import { Button } from "@okkey/ui";

import { buildBuiltInRoleSummaries } from "./builtinRoles";
import RolesListCard from "./RolesListCard";

type BuiltInRolesListProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  memberCounts?: Partial<Record<WorkspaceBuiltInRoleId, number>>;
  loadError?: string | null;
  onRetry?: () => void;
};

export default function BuiltInRolesList({ t, memberCounts, loadError, onRetry }: BuiltInRolesListProps) {
  const roles: WorkspaceRoleSummary[] = buildBuiltInRoleSummaries(t, memberCounts);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">{t("web.workspaceSettings.roles.builtIn.title")}</h3>
        <p className="text-sm text-muted-foreground">{t("web.workspaceSettings.roles.builtIn.subtitle")}</p>
      </div>
      {loadError ? (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span className="min-w-0 flex-1">{loadError}</span>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {t("web.workspaceSettings.roles.retry")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <RolesListCard roles={roles} t={t} />
    </section>
  );
}
