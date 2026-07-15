import type { WorkspaceRoleSummary } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import { cn } from "@okkey/ui";
import type { ReactNode } from "react";

type RolesListCardProps = {
  roles: readonly WorkspaceRoleSummary[];
  t: (messageKey: string, values?: WebMessageValues) => string;
  renderTrailing?: (role: WorkspaceRoleSummary) => ReactNode;
  className?: string;
};

function memberCountLabel(count: number, t: RolesListCardProps["t"]): string {
  return t("web.workspaceSettings.roles.memberCount", { count });
}

export default function RolesListCard({ roles, t, renderTrailing, className }: RolesListCardProps) {
  if (roles.length === 0) {
    return null;
  }

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border", className)}>
      {roles.map((role, index) => (
        <div
          key={role.id}
          className={cn(
            "flex items-center gap-4 px-4 py-4",
            index > 0 && "border-t border-border",
          )}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="truncate text-sm font-medium text-foreground">{role.name}</p>
            <p className="truncate text-sm text-muted-foreground">{role.description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="px-3 text-sm text-muted-foreground">{memberCountLabel(role.memberCount, t)}</span>
            {renderTrailing?.(role)}
          </div>
        </div>
      ))}
    </div>
  );
}
