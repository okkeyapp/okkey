import type { WebMessageValues } from "@okkey/i18n";
import type { WorkspaceBuiltInProfileId, WorkspaceProfileSummary } from "@okkey/types";
import { Button } from "@okkey/ui";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { ComponentType, ReactNode } from "react";

import {
  EDIT_PROFILE_POPUP_ID,
  POPUP_QUERY_PARAM,
  buildPopupQueryValue,
  parsePopupQueryValue,
  popupQuerySearch,
} from "../../../../routes/popupQuery";
import { buildBuiltInProfileSummaries } from "./builtinProfiles";
import ProfilesListCard from "./ProfilesListCard";

export type BuiltInProfileCardPopupProps = {
  popupId: string;
  builtinId: WorkspaceBuiltInProfileId;
  name: string;
  description: string;
  rolesLink: ReactNode;
  t: (key: string) => string;
  onClose: () => void;
};

type BuiltInProfilesListProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
  applicationCounts?: Partial<Record<WorkspaceBuiltInProfileId, number>>;
  loadError?: string | null;
  onRetry?: () => void;
  rolesLink?: ReactNode;
  ProfileCardPopup?: ComponentType<BuiltInProfileCardPopupProps>;
};

function isBuiltInProfileId(value: string): value is WorkspaceBuiltInProfileId {
  return value === "extended" || value === "simple";
}

export default function BuiltInProfilesList({
  t,
  applicationCounts,
  loadError,
  onRetry,
  rolesLink,
  ProfileCardPopup,
}: BuiltInProfilesListProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activePopup = parsePopupQueryValue(searchParams.get(POPUP_QUERY_PARAM));
  const viewingBuiltinId =
    activePopup?.popupId === EDIT_PROFILE_POPUP_ID &&
    activePopup.menuItemId &&
    isBuiltInProfileId(activePopup.menuItemId)
      ? activePopup.menuItemId
      : null;

  const profiles: WorkspaceProfileSummary[] = buildBuiltInProfileSummaries(t, applicationCounts);
  const viewingProfile = viewingBuiltinId
    ? (profiles.find((profile) => profile.builtinId === viewingBuiltinId) ?? null)
    : null;

  function openProfilePopup(profile: WorkspaceProfileSummary) {
    if (!profile.builtinId) {
      return;
    }
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(
          location.search,
          buildPopupQueryValue(EDIT_PROFILE_POPUP_ID, profile.builtinId),
        ),
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
        <h3 className="text-sm font-medium text-foreground">
          {t("web.workspaceSettings.profiles.builtIn.title")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("web.workspaceSettings.profiles.builtIn.subtitle")}
        </p>
      </div>
      {loadError ? (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span className="min-w-0 flex-1">{loadError}</span>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {t("web.workspaceSettings.profiles.retry")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <ProfilesListCard
        profiles={profiles}
        t={t}
        onProfileClick={ProfileCardPopup ? openProfilePopup : undefined}
      />

      {viewingProfile && viewingBuiltinId && ProfileCardPopup && rolesLink ? (
        <ProfileCardPopup
          popupId={EDIT_PROFILE_POPUP_ID}
          builtinId={viewingBuiltinId}
          name={viewingProfile.name}
          description={viewingProfile.description}
          rolesLink={rolesLink}
          t={t}
          onClose={closePopup}
        />
      ) : null}
    </section>
  );
}
