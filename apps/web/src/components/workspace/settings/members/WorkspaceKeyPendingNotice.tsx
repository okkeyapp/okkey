import type { CoreApiClient } from "@okkey/api";
import type { WebMessageValues } from "@okkey/i18n";
import { useEffect, useState } from "react";

import { bindClientMethod } from "./workspaceKeyAccess";

type WorkspaceKeyPendingNoticeProps = {
  core: CoreApiClient;
  workspaceId: string;
  t: (messageKey: string, values?: WebMessageValues) => string;
};

/**
 * Shown when a workspace key exists and this member does not hold the current version.
 * API failures stay quiet so the settings page still renders.
 */
export default function WorkspaceKeyPendingNotice({
  core,
  workspaceId,
  t,
}: WorkspaceKeyPendingNoticeProps) {
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (typeof core.getWorkspaceKey !== "function") {
      setMissing(false);
      return;
    }
    const getWorkspaceKey = bindClientMethod(core, core.getWorkspaceKey);
    let cancelled = false;
    void getWorkspaceKey(workspaceId)
      .then((state) => {
        if (cancelled) {
          return;
        }
        const version = state.current_version;
        const held =
          version != null && state.wraps.some((wrap) => wrap.key_version === version);
        setMissing(version != null && !held);
      })
      .catch(() => {
        if (!cancelled) {
          setMissing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [core, workspaceId]);

  if (!missing) {
    return null;
  }

  return (
    <p className="text-sm text-muted-foreground" role="status">
      {t("web.workspace.workspaceKey.pendingNotice")}
    </p>
  );
}
