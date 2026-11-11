import type { CoreApiClient } from "@okkey/api";
import type { WebMessageValues } from "@okkey/i18n";
import { Component, useEffect, useState, type ReactNode } from "react";

type WorkspaceKeyPendingNoticeProps = {
  core: CoreApiClient;
  workspaceId: string;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onAccessChange?: (access: "open" | "pending" | "unknown") => void;
};

/**
 * Shown when a workspace key exists and this member does not hold the current version.
 * The read is `core.getWorkspaceKey` on the client instance. API failures render nothing.
 */
export default function WorkspaceKeyPendingNotice({
  core,
  workspaceId,
  t,
  onAccessChange,
}: WorkspaceKeyPendingNoticeProps) {
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (typeof core.getWorkspaceKey !== "function") {
          if (!cancelled) {
            setMissing(false);
            onAccessChange?.("unknown");
          }
          return;
        }
        const state = await core.getWorkspaceKey(workspaceId);
        if (cancelled) {
          return;
        }
        const version = state.current_version;
        const held = version != null && state.wraps.some((wrap) => wrap.key_version === version);
        const pending = version != null && !held;
        setMissing(pending);
        onAccessChange?.(version == null || held ? "open" : "pending");
      } catch {
        if (!cancelled) {
          setMissing(false);
          onAccessChange?.("unknown");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [core, onAccessChange, workspaceId]);

  if (!missing) {
    return null;
  }

  return (
    <p className="text-sm text-muted-foreground" role="status">
      {t("web.workspace.workspaceKey.pendingNotice")}
    </p>
  );
}

type BoundaryProps = { children: ReactNode };
type BoundaryState = { failed: boolean };

/** Keeps a notice render error from unmounting the workspace shell. */
export class WorkspaceKeyNoticeBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return null;
    }
    return this.props.children;
  }
}
