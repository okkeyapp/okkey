import type { ReactNode, SVGProps } from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiRequestError } from "@okkey/api";
import type { Workspace } from "@okkey/types";
import { Spinner, WorkspaceTile } from "@okkey/ui";

import { useAuthVault, useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import { writeStoredCurrentWorkspaceId } from "../../auth/workspaceStorage";
import { ITEMS_PATH } from "../../routes/paths";
import { useLocale } from "../../locale/LocaleContext";

const PERSONAL_FREE_TILE_COLOR = "#3B82F6";

/** Matches `WorkspaceTile` / create-workspace button (`workspace-tile.tsx`). */
const WORKSPACE_TILE_BOX_CLASS = "h-[170px] w-[180px] shrink-0 rounded-xl";

const dashedTileChrome =
  "border border-dashed border-foreground/90 bg-transparent shadow-none dark:border-foreground/70";

function CreateWorkspaceMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={48}
      height={48}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      {...props}
    >
      <path
        d="M18 24H30M24 18V30M40 25.9999C40 35.9999 33 40.9999 24.68 43.8999C24.2443 44.0476 23.7711 44.0405 23.34 43.8799C15 40.9999 8 35.9999 8 25.9999V11.9999C8 11.4695 8.21071 10.9608 8.58579 10.5857C8.96086 10.2106 9.46957 9.99992 10 9.99992C14 9.99992 19 7.59992 22.48 4.55992C22.9037 4.19792 23.4427 3.99902 24 3.99902C24.5573 3.99902 25.0963 4.19792 25.52 4.55992C29.02 7.61992 34 9.99992 38 9.99992C38.5304 9.99992 39.0391 10.2106 39.4142 10.5857C39.7893 10.9608 40 11.4695 40 11.9999V25.9999Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function planDescriptionKey(planTier: string): string {
  if (planTier === "FREE") {
    return "plan.free";
  }
  return "plan.enterprise";
}

function WorkspacesListChrome({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full flex-nowrap items-start justify-center gap-4 overflow-x-auto px-1 py-3">
      {children}
    </div>
  );
}

function WorkspacesLoadingPlaceholder() {
  const { t } = useLocale();
  const label = t("workspaces.loading");

  return (
    <WorkspacesListChrome>
      <div
        className={`box-border flex ${WORKSPACE_TILE_BOX_CLASS} items-center justify-center border border-transparent bg-transparent p-[12px]`}
        role="status"
        aria-busy
        aria-label={label}
      >
        <div className="flex h-[36px] w-[36px] shrink-0 items-center justify-center">
          <Spinner />
        </div>
        <span className="sr-only">{label}</span>
      </div>
    </WorkspacesListChrome>
  );
}

export default function WorkspacesContent() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const { userId } = useAuthVault();
  const core = useAuthenticatedCoreClient();
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!core) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await core.listWorkspaces();
        if (!cancelled) {
          setWorkspaces(list);
        }
      } catch (e) {
        if (!cancelled) {
          if (e instanceof ApiRequestError) {
            setLoadError(t("auth.email.errorGeneric"));
          } else {
            setLoadError(t("auth.email.errorGeneric"));
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [core, t]);

  if (loadError) {
    return <p className="okkey-body text-center text-destructive">{loadError}</p>;
  }

  if (workspaces === null) {
    return <WorkspacesLoadingPlaceholder />;
  }

  if (workspaces.length === 0) {
    return <p className="okkey-body text-center text-copy-secondary">{t("workspaces.description")}</p>;
  }

  return (
    <WorkspacesListChrome>
      {workspaces.map((ws) => {
        const isFree = ws.planTier === "FREE";
        return (
          <WorkspaceTile
            key={ws.id}
            type="button"
            title={ws.name}
            description={t(planDescriptionKey(ws.planTier))}
            {...(isFree ? { tileColor: PERSONAL_FREE_TILE_COLOR } : { business: true })}
            onClick={() => {
              if (userId) {
                writeStoredCurrentWorkspaceId(userId, ws.id);
              }
              navigate(ITEMS_PATH);
            }}
          />
        );
      })}

      <button
        type="button"
        aria-label={t("workspaces.createWorkspaceAria")}
        className={`flex ${WORKSPACE_TILE_BOX_CLASS} flex-col items-center justify-center gap-3 p-6 ${dashedTileChrome} transition-[transform,box-shadow] hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
      >
        <p className="okkey-body-strong text-center text-copy-primary">
          {t("workspaces.createLine1")}
          <br />
          {t("workspaces.createLine2")}
        </p>
        <CreateWorkspaceMark className="shrink-0 text-copy-primary" />
      </button>
    </WorkspacesListChrome>
  );
}
