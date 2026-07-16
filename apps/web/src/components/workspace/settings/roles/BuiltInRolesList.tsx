import type { WebMessageValues } from "@okkey/i18n";
import type { WorkspaceBuiltInRoleId, WorkspaceRoleSummary } from "@okkey/types";
import { Button } from "@okkey/ui";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { ComponentType, ReactNode } from "react";

import {
  EDIT_ROLE_POPUP_ID,
  POPUP_QUERY_PARAM,
  buildPopupQueryValue,
  parsePopupQueryValue,
  popupQuerySearch,
} from "../../../../routes/popupQuery";
import { buildBuiltInRoleSummaries } from "./builtinRoles";
import RolesListCard from "./RolesListCard";

export type BuiltInRoleCardPopupProps = {
  popupId: string;
  builtinId: WorkspaceBuiltInRoleId;
  name: string;
  description: string;
  profilesLink: ReactNode;
  t: (key: string) => string;
  onClose: () => void;
};

type BuiltInRolesListProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  memberCounts?: Partial<Record<WorkspaceBuiltInRoleId, number>>;
  loadError?: string | null;
  onRetry?: () => void;
  profilesLink?: ReactNode;
  RoleCardPopup?: ComponentType<BuiltInRoleCardPopupProps>;
};

function isBuiltInRoleId(value: string): value is WorkspaceBuiltInRoleId {
  return value === "owner" || value === "admin" || value === "user";
}

export default function BuiltInRolesList({
  t,
  memberCounts,
  loadError,
  onRetry,
  profilesLink,
  RoleCardPopup,
}: BuiltInRolesListProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activePopup = parsePopupQueryValue(searchParams.get(POPUP_QUERY_PARAM));
  const viewingBuiltinId =
    activePopup?.popupId === EDIT_ROLE_POPUP_ID && activePopup.menuItemId && isBuiltInRoleId(activePopup.menuItemId)
      ? activePopup.menuItemId
      : null;

  const roles: WorkspaceRoleSummary[] = buildBuiltInRoleSummaries(t, memberCounts);
  const viewingRole = viewingBuiltinId
    ? roles.find((role) => role.builtinId === viewingBuiltinId) ?? null
    : null;

  function openRolePopup(role: WorkspaceRoleSummary) {
    if (!role.builtinId) {
      return;
    }
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, buildPopupQueryValue(EDIT_ROLE_POPUP_ID, role.builtinId)),
        hash: location.hash,
      },
      { replace: false },
    );
  }

  function closePopup() {
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, null),
        hash: location.hash,
      },
      { replace: false },
    );
  }

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
      <RolesListCard
        roles={roles}
        t={t}
        onRoleClick={RoleCardPopup ? openRolePopup : undefined}
      />

      {viewingRole && viewingBuiltinId && RoleCardPopup && profilesLink ? (
        <RoleCardPopup
          popupId={EDIT_ROLE_POPUP_ID}
          builtinId={viewingBuiltinId}
          name={viewingRole.name}
          description={viewingRole.description}
          profilesLink={profilesLink}
          t={t}
          onClose={closePopup}
        />
      ) : null}
    </section>
  );
}
